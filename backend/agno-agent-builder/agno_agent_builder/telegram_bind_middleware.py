"""ASGI middleware that intercepts `/start <token>` Telegram updates on bot
webhook paths and binds the Telegram user to a CMS user via the host's
`POST /api/telegram-binding-tokens/bind` endpoint.

Runs BEFORE agno's Telegram router on every Telegram webhook hit. If the
update is `/start <token>` it short-circuits, calls the CMS to bind, and
replies via the Bot API directly (no agent invocation). For every other
update it transparently re-injects the request body and lets agno proceed.

This is the cleanest place to intercept: agno's `Telegram` interface
hardcodes `/start` to send a static welcome message and doesn't expose a
hook for custom handlers. Subclassing the interface would force us to
fork agno's 200+ line `attach_routes` closure; ASGI middleware avoids
that at the cost of one extra body read.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import structlog

logger = structlog.get_logger("agno_agent_builder.telegram_bind_middleware")

INTERNAL_SECRET_HEADER = "X-Internal-Secret"  # noqa: S105
TELEGRAM_API_BASE = "https://api.telegram.org"


class TelegramBindState:
    """Mutable holder populated by `app.py`'s lifespan once installations are
    fetched. Lets us register the middleware unconditionally at app
    construction (Starlette's middleware stack is built before lifespan
    runs) and fill in the per-bot config afterwards.
    """

    def __init__(self) -> None:
        self.webhook_paths: set[str] = set()
        self.bot_tokens: dict[str, str] = {}
        self.installation_ids: dict[str, str | int] = {}

    def update(
        self,
        *,
        webhook_paths: list[str],
        bot_tokens: dict[str, str],
        installation_ids: dict[str, str | int],
    ) -> None:
        self.webhook_paths = set(webhook_paths)
        self.bot_tokens = bot_tokens
        self.installation_ids = installation_ids


class TelegramBindMiddleware:
    """Intercepts `/start <token>` POSTs to any registered Telegram webhook path.

    Reads its per-bot config from a `TelegramBindState` populated in lifespan
    startup (so we can register the middleware up-front without knowing which
    bots exist yet — the middleware passes through every request until state
    is populated).
    """

    def __init__(
        self,
        app: Any,
        *,
        payload_url: str,
        internal_secret: str,
        state: TelegramBindState,
    ) -> None:
        self.app = app
        self._payload_url = payload_url.rstrip("/")
        self._internal_secret = internal_secret
        self._state = state

    async def __call__(
        self, scope: dict[str, Any], receive: Callable[[], Awaitable[dict]], send: Callable
    ) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        path = scope["path"]
        if path not in self._state.webhook_paths:
            await self.app(scope, receive, send)
            return

        # Buffer the body so we can both inspect it and replay it.
        body = await _read_body(receive)

        try:
            update = json.loads(body)
        except json.JSONDecodeError:
            await self.app(scope, _replay(body), send)
            return

        token = _extract_start_token(update)
        if token is None:
            await self.app(scope, _replay(body), send)
            return

        bot_username = _bot_username_from_path(path)
        if bot_username is None or bot_username not in self._state.bot_tokens:
            await self.app(scope, _replay(body), send)
            return

        message = update.get("message") or {}
        from_user = message.get("from") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        telegram_user_id = from_user.get("id")
        telegram_username = from_user.get("username")

        if chat_id is None or telegram_user_id is None:
            await self.app(scope, _replay(body), send)
            return

        bot_token = self._state.bot_tokens[bot_username]
        installation_id = self._state.installation_ids[bot_username]

        try:
            reply = await self._bind_and_reply(
                token=token,
                telegram_id=telegram_user_id,
                telegram_username=telegram_username,
                bot_installation_id=installation_id,
            )
        except Exception:
            logger.exception("Telegram bind interceptor failed", bot=bot_username)
            reply = "Something went wrong while linking your account. Please try again."

        await _send_telegram_message(bot_token, chat_id, reply)
        await _respond_200(send)

    async def _bind_and_reply(
        self,
        *,
        token: str,
        telegram_id: int,
        telegram_username: str | None,
        bot_installation_id: str | int,
    ) -> str:
        url = f"{self._payload_url}/api/telegram-binding-tokens/bind"
        payload = {
            "token": token,
            "telegramId": telegram_id,
            "botInstallationId": bot_installation_id,
        }
        if telegram_username:
            payload["telegramUsername"] = telegram_username

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url, headers={INTERNAL_SECRET_HEADER: self._internal_secret}, json=payload
            )

        if response.status_code == 200:
            data = response.json().get("user", {})
            display = (
                data.get("telegramUsername") or data.get("email") or "your Zetesis account"
            )
            return f"Connected to {display}. You can now chat with the agent."
        if response.status_code in (404, 410):
            return "This binding link is invalid or has expired. Please generate a new one in /settings/telegram."
        if response.status_code == 403:
            return "This binding link doesn't match this bot. Please generate a new one."
        return "Sorry — couldn't link your account right now. Please try again in a minute."


def _extract_start_token(update: dict) -> str | None:
    text = (update.get("message") or {}).get("text")
    if not isinstance(text, str):
        return None
    parts = text.strip().split(maxsplit=1)
    if len(parts) != 2:
        return None
    cmd = parts[0].split("@")[0]  # strip /start@BotName
    if cmd != "/start":
        return None
    return parts[1].strip() or None


def _bot_username_from_path(path: str) -> str | None:
    # /telegram/<botUsername>/webhook
    parts = path.strip("/").split("/")
    if len(parts) != 3 or parts[0] != "telegram" or parts[2] != "webhook":
        return None
    return parts[1]


async def _read_body(receive: Callable[[], Awaitable[dict]]) -> bytes:
    chunks: list[bytes] = []
    while True:
        message = await receive()
        if message["type"] != "http.request":
            break
        chunks.append(message.get("body", b""))
        if not message.get("more_body", False):
            break
    return b"".join(chunks)


def _replay(body: bytes) -> Callable[[], Awaitable[dict]]:
    sent = False

    async def receive() -> dict:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return receive


async def _send_telegram_message(bot_token: str, chat_id: int, text: str) -> None:
    url = f"{TELEGRAM_API_BASE}/bot{bot_token}/sendMessage"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            await client.post(url, json={"chat_id": chat_id, "text": text})
        except httpx.HTTPError:
            logger.exception("Failed to send Telegram bind reply")


async def _respond_200(send: Callable) -> None:
    await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": b'{"status":"ok"}', "more_body": False})
