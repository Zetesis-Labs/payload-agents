"""End-to-end HTTP tests for the Teams /messages endpoint.

Drive the FastAPI router with TestClient, signing real JWTs against a
locally generated RSA key whose JWK we inject into the verification
module cache. This exercises the full request → JWT validation →
agent.arun → Bot Connector reply chain without any network calls.

Why an integration test (not just unit tests on _handle_message): the
JWT-validation gate, the BackgroundTasks dispatch, and the MSAL/
httpx-driven reply path only run together when the router is mounted on
a real ASGI app — that's what regresses if anyone reorders the gate or
swaps `httpx` for another client.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from typing import Any, ClassVar
from unittest.mock import AsyncMock, MagicMock

import httpx
import jwt
import pytest
from agno_microsoft_teams import interface as interface_module
from agno_microsoft_teams import verification
from agno_microsoft_teams.interface import TeamsInterface
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient

APP_ID = "bot-app-id-123"
SERVICE_URL = "https://smba.trafficmanager.net/emea/"
CONVERSATION_ID = "convo-1"
ACTIVITY_ID = "activity-1"


@pytest.fixture(autouse=True)
def _reset_jwks_cache() -> AsyncIterator[None]:
    verification._jwks_cache.keys_by_kid = {}
    verification._jwks_cache.fetched_at = 0.0
    yield
    verification._jwks_cache.keys_by_kid = {}
    verification._jwks_cache.fetched_at = 0.0


@pytest.fixture(autouse=True)
def _freeze_prime_jwks_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace prime_jwks_cache with a no-op so a verification failure
    never reaches the real OpenID endpoint. Tests prime the cache
    explicitly with _prime_cache_with(...).
    """

    async def _noop(*, force: bool = False) -> dict[str, Any]:
        return verification._jwks_cache.keys_by_kid

    monkeypatch.setattr(verification, "prime_jwks_cache", _noop)


def _generate_signing_key() -> tuple[bytes, str, dict[str, Any]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_jwk = jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    public_jwk["kid"] = "test-kid"
    public_jwk["alg"] = "RS256"
    return private_pem, "test-kid", public_jwk


def _prime_cache_with(jwk_dict: dict[str, Any]) -> None:
    verification._jwks_cache.keys_by_kid = {
        jwk_dict["kid"]: jwt.algorithms.RSAAlgorithm.from_jwk(jwk_dict)
    }
    verification._jwks_cache.fetched_at = time.time()


def _issue_token(
    *,
    private_pem: bytes,
    kid: str,
    audience: str,
    service_url: str | None,
    exp_offset: int = 60,
) -> str:
    payload: dict[str, Any] = {
        "aud": audience,
        "iss": "https://api.botframework.com",
        "iat": int(time.time()) - 5,
        "exp": int(time.time()) + exp_offset,
    }
    if service_url:
        payload["serviceurl"] = service_url
    return jwt.encode(payload, private_pem, algorithm="RS256", headers={"kid": kid})


def _make_app(agent: Any) -> FastAPI:
    app = FastAPI()
    iface = TeamsInterface(
        agent=agent,
        app_id=APP_ID,
        app_password="ignored-in-tests",
        tenant_id=None,
        prefix=f"/teams/{APP_ID}",
    )
    app.include_router(iface.get_router())
    return app


def _message_activity(text: str = "hola bot") -> dict[str, Any]:
    return {
        "type": "message",
        "id": ACTIVITY_ID,
        "serviceUrl": SERVICE_URL,
        "conversation": {"id": CONVERSATION_ID},
        "from": {"id": "user-1", "name": "User"},
        "recipient": {"id": "bot-1", "name": "Bot"},
        "text": text,
    }


class _StubAsyncClient:
    """Stand-in for httpx.AsyncClient that records calls for assertions."""

    captured: ClassVar[list[dict[str, Any]]] = []

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> _StubAsyncClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    async def post(
        self, url: str, *, headers: dict[str, str], json: dict[str, Any]
    ) -> httpx.Response:
        _StubAsyncClient.captured.append({"url": url, "headers": headers, "json": json})
        return httpx.Response(200)


@pytest.fixture()
def stub_outbound(monkeypatch: pytest.MonkeyPatch) -> type[_StubAsyncClient]:
    _StubAsyncClient.captured = []
    monkeypatch.setattr(interface_module.httpx, "AsyncClient", _StubAsyncClient)

    async def _fake_acquire(_client: Any) -> str:
        return "test-bot-token"

    monkeypatch.setattr(interface_module, "acquire_bot_token", _fake_acquire)
    return _StubAsyncClient


def test_rejects_when_authorization_header_missing() -> None:
    agent = MagicMock()
    with TestClient(_make_app(agent)) as client:
        resp = client.post(f"/teams/{APP_ID}/messages", json=_message_activity())
    assert resp.status_code == 401
    assert resp.json() == {"detail": "Invalid bot framework token"}


def test_rejects_when_jwt_audience_does_not_match_app_id() -> None:
    pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    bad_token = _issue_token(
        private_pem=pem, kid=kid, audience="different-bot", service_url=SERVICE_URL
    )
    agent = MagicMock()
    with TestClient(_make_app(agent)) as client:
        resp = client.post(
            f"/teams/{APP_ID}/messages",
            json=_message_activity(),
            headers={"Authorization": f"Bearer {bad_token}"},
        )
    assert resp.status_code == 401


def test_rejects_when_jwt_service_url_does_not_match_body() -> None:
    pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(
        private_pem=pem,
        kid=kid,
        audience=APP_ID,
        service_url="https://evil.example.com/",
    )
    agent = MagicMock()
    with TestClient(_make_app(agent)) as client:
        resp = client.post(
            f"/teams/{APP_ID}/messages",
            json=_message_activity(),
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 401


def test_conversation_update_returns_200_without_invoking_agent() -> None:
    pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(private_pem=pem, kid=kid, audience=APP_ID, service_url=SERVICE_URL)
    agent = MagicMock()
    agent.arun = AsyncMock()
    activity = {
        "type": "conversationUpdate",
        "serviceUrl": SERVICE_URL,
        "conversation": {"id": CONVERSATION_ID},
    }
    with TestClient(_make_app(agent)) as client:
        resp = client.post(
            f"/teams/{APP_ID}/messages",
            json=activity,
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    agent.arun.assert_not_called()


def test_empty_message_without_attachments_is_acked_without_agent_run() -> None:
    pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(private_pem=pem, kid=kid, audience=APP_ID, service_url=SERVICE_URL)
    agent = MagicMock()
    agent.arun = AsyncMock()
    activity = _message_activity(text="")
    with TestClient(_make_app(agent)) as client:
        resp = client.post(
            f"/teams/{APP_ID}/messages",
            json=activity,
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    agent.arun.assert_not_called()


def test_message_runs_agent_and_posts_reply_to_bot_connector(
    stub_outbound: type[_StubAsyncClient],
) -> None:
    pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(private_pem=pem, kid=kid, audience=APP_ID, service_url=SERVICE_URL)

    agent_response = MagicMock()
    agent_response.content = "hi back"
    agent_response.images = None
    agent_response.videos = None
    agent_response.audio = None
    agent_response.files = None
    agent = MagicMock()
    agent.arun = AsyncMock(return_value=agent_response)

    with TestClient(_make_app(agent)) as client:
        resp = client.post(
            f"/teams/{APP_ID}/messages",
            json=_message_activity(text="hola bot"),
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 202
    agent.arun.assert_awaited_once()
    args, _kwargs = agent.arun.call_args
    assert args[0] == "hola bot"

    assert len(stub_outbound.captured) == 1
    reply = stub_outbound.captured[0]
    assert (
        reply["url"]
        == f"{SERVICE_URL.rstrip('/')}/v3/conversations/{CONVERSATION_ID}/activities/{ACTIVITY_ID}"
    )
    assert reply["headers"]["Authorization"] == "Bearer test-bot-token"
    assert reply["json"]["type"] == "message"
    assert reply["json"]["text"] == "hi back"
    assert reply["json"]["replyToId"] == ACTIVITY_ID


def test_message_with_bot_mention_strips_mention_before_calling_agent(
    stub_outbound: type[_StubAsyncClient],
) -> None:
    pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(private_pem=pem, kid=kid, audience=APP_ID, service_url=SERVICE_URL)
    agent_response = MagicMock()
    agent_response.content = "ok"
    agent_response.images = None
    agent_response.videos = None
    agent_response.audio = None
    agent_response.files = None
    agent = MagicMock()
    agent.arun = AsyncMock(return_value=agent_response)

    activity = _message_activity(text="<at>Bot</at> hola")
    activity["entities"] = [{"type": "mention", "text": "<at>Bot</at>"}]

    with TestClient(_make_app(agent)) as client:
        resp = client.post(
            f"/teams/{APP_ID}/messages",
            json=activity,
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 202
    agent.arun.assert_awaited_once()
    args, _ = agent.arun.call_args
    assert args[0] == "hola"


def test_agent_timeout_sends_fallback_reply(
    monkeypatch: pytest.MonkeyPatch, stub_outbound: type[_StubAsyncClient]
) -> None:
    pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(private_pem=pem, kid=kid, audience=APP_ID, service_url=SERVICE_URL)

    # Force a real asyncio.wait_for timeout by making arun outlast the budget.
    monkeypatch.setattr(interface_module, "TEAMS_AGENT_RUN_TIMEOUT_S", 0.01)

    async def _slow(*_args: Any, **_kwargs: Any) -> Any:
        await interface_module.asyncio.sleep(1.0)
        return None

    agent = MagicMock()
    agent.arun = _slow

    with TestClient(_make_app(agent)) as client:
        resp = client.post(
            f"/teams/{APP_ID}/messages",
            json=_message_activity(text="ping"),
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 202
    assert len(stub_outbound.captured) == 1
    assert stub_outbound.captured[0]["json"]["text"].startswith("Took too long")


def test_agent_exception_sends_generic_error_reply(
    stub_outbound: type[_StubAsyncClient],
) -> None:
    pem, kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    token = _issue_token(private_pem=pem, kid=kid, audience=APP_ID, service_url=SERVICE_URL)
    agent = MagicMock()
    agent.arun = AsyncMock(side_effect=RuntimeError("boom"))

    with TestClient(_make_app(agent)) as client:
        resp = client.post(
            f"/teams/{APP_ID}/messages",
            json=_message_activity(text="ping"),
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 202
    assert len(stub_outbound.captured) == 1
    assert "something went wrong" in stub_outbound.captured[0]["json"]["text"]


def test_invalid_json_body_returns_400() -> None:
    _pem, _kid, jwk = _generate_signing_key()
    _prime_cache_with(jwk)
    agent = MagicMock()
    with TestClient(_make_app(agent)) as client:
        resp = client.post(
            f"/teams/{APP_ID}/messages",
            content=b"not-json",
            headers={
                "Authorization": "Bearer ignored",
                "Content-Type": "application/json",
            },
        )
    assert resp.status_code == 400
