"""Outbound media for Teams: turn agno ``RunOutput`` media (``response.images``,
``response.videos``, ``response.audio``, ``response.files``) and explicit Teams
cards into Bot Framework ``attachments[]`` so the agent can deliver pictures,
PDFs, audio, Adaptive Cards, etc. through the channel.

We use ``data:`` URIs (RFC 2397) for in-memory bytes — Teams renders them
fine and it skips the upload-then-attach round trip entirely. URL-only media
gets passed through verbatim.

Bot Framework activities have a documented payload cap around 256 KB
end-to-end; once base64-encoded a 200 KB image is ~270 KB, so we hard-skip
items whose encoded form would push the activity past 220 KB and log it.
At that size the right answer is upload-and-link (OneDrive/SharePoint),
which we punt to a future iteration when a use case demands it.
"""

from __future__ import annotations

import base64
from collections.abc import Iterable, Mapping
from typing import Any

import structlog
from agno.media import Audio, File, Image, Video

logger = structlog.get_logger("agno_microsoft_teams.outbound_media")

ADAPTIVE_CARD_CONTENT_TYPE = "application/vnd.microsoft.card.adaptive"

# 220 KB for the final data URI — leaves room under the documented 256 KB
# activity limit for the JSON envelope, mentions, text body, etc.
MAX_INLINE_ATTACHMENT_BYTES = 220 * 1024


def build_attachments(response: Any) -> list[dict[str, Any]]:
    """Walk all media collections on the agno response and produce the JSON
    list ready to drop into ``activity["attachments"]``.

    Anything that lacks both ``content`` and ``url`` is skipped (defensive
    against partial responses); same for items above the inline size budget.
    """
    out: list[dict[str, Any]] = []
    for source in _iter_response_attachment_sources(response):
        out.extend(_iter_response_card_attachments(source))
    for media, default_mime in _iter_response_media(response):
        attachment = _to_attachment(media, default_mime=default_mime)
        if attachment is not None:
            out.append(attachment)
    return out


def adaptive_card_attachment(card: Mapping[str, Any]) -> dict[str, Any]:
    return {"contentType": ADAPTIVE_CARD_CONTENT_TYPE, "content": dict(card)}


def _iter_response_card_attachments(response: Any) -> Iterable[dict[str, Any]]:
    for card in _iter_structured_items(response, "adaptive_cards", "teams_cards"):
        if _is_adaptive_card(card):
            yield adaptive_card_attachment(card)
        else:
            logger.warning("Skipping malformed Teams Adaptive Card")

    for attachment in _iter_structured_items(response, "teams_attachments"):
        if _is_bot_framework_attachment(attachment):
            yield dict(attachment)
        else:
            logger.warning("Skipping malformed Teams attachment")


def _iter_response_attachment_sources(response: Any) -> Iterable[Any]:
    yield response
    content = getattr(response, "content", None)
    if content is not None and content is not response and not isinstance(content, (str, bytes)):
        yield content


def _iter_structured_items(response: Any, *attrs: str) -> Iterable[Mapping[str, Any]]:
    for attr in attrs:
        value = (
            response.get(attr) if isinstance(response, Mapping) else getattr(response, attr, None)
        )
        if value is None:
            continue
        if isinstance(value, Mapping):
            yield value
            continue
        if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
            for item in value:
                if isinstance(item, Mapping):
                    yield item


def _is_adaptive_card(card: Mapping[str, Any]) -> bool:
    return (
        card.get("type") == "AdaptiveCard"
        and isinstance(card.get("version"), str)
        and isinstance(card.get("body"), list)
    )


def _is_bot_framework_attachment(attachment: Mapping[str, Any]) -> bool:
    content_type = attachment.get("contentType")
    return isinstance(content_type, str) and bool(content_type)


def _iter_response_media(response: Any) -> Iterable[tuple[Any, str]]:
    for items in (
        getattr(response, "images", None) or (),
        getattr(response, "videos", None) or (),
        getattr(response, "audio", None) or (),
        getattr(response, "files", None) or (),
    ):
        for item in items:
            yield item, _default_mime_for(item)


def _default_mime_for(media: Any) -> str:
    if isinstance(media, Image):
        return "image/png"
    if isinstance(media, Video):
        return "video/mp4"
    if isinstance(media, Audio):
        return "audio/mpeg"
    if isinstance(media, File):
        return "application/octet-stream"
    return "application/octet-stream"


def _to_attachment(media: Any, *, default_mime: str) -> dict[str, Any] | None:
    name = _media_name(media)
    mime = getattr(media, "mime_type", None) or default_mime

    url = getattr(media, "url", None)
    if isinstance(url, str) and url:
        return {"contentType": mime, "contentUrl": url, "name": name}

    raw = getattr(media, "content", None)
    if isinstance(raw, bytes) and raw:
        encoded = base64.b64encode(raw).decode("ascii")
        content_url = f"data:{mime};base64,{encoded}"
        if len(content_url.encode("utf-8")) > MAX_INLINE_ATTACHMENT_BYTES:
            logger.warning(
                "Skipping outbound Teams attachment over inline-size budget",
                name=name,
                raw_size=len(raw),
                encoded_size=len(content_url),
                budget=MAX_INLINE_ATTACHMENT_BYTES,
            )
            return None
        return {
            "contentType": mime,
            "contentUrl": content_url,
            "name": name,
        }

    return None


def _media_name(media: Any) -> str:
    for attr in ("filename", "name"):
        value = getattr(media, attr, None)
        if isinstance(value, str) and value:
            return value
    if isinstance(media, Image):
        return "image"
    if isinstance(media, Video):
        return "video"
    if isinstance(media, Audio):
        return "audio"
    if isinstance(media, File):
        return "file"
    return "attachment"
