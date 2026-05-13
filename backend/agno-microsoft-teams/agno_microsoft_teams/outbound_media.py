"""Outbound media for Teams: turn agno ``RunOutput`` media (``response.images``,
``response.videos``, ``response.audio``, ``response.files``) into Bot Framework
``attachments[]`` so the agent can deliver pictures, PDFs, audio, etc. through
the channel.

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
from collections.abc import Iterable
from typing import Any

import structlog
from agno.media import Audio, File, Image, Video

logger = structlog.get_logger("agno_microsoft_teams.outbound_media")

# 220 KB — leaves room under the documented 256 KB activity limit for the
# JSON envelope, mentions, text body, etc.
MAX_INLINE_ATTACHMENT_BYTES = 220 * 1024


def build_attachments(response: Any) -> list[dict[str, Any]]:
    """Walk all media collections on the agno response and produce the JSON
    list ready to drop into ``activity["attachments"]``.

    Anything that lacks both ``content`` and ``url`` is skipped (defensive
    against partial responses); same for items above the inline size budget.
    """
    out: list[dict[str, Any]] = []
    for media, default_mime in _iter_response_media(response):
        attachment = _to_attachment(media, default_mime=default_mime)
        if attachment is not None:
            out.append(attachment)
    return out


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
        if len(raw) > MAX_INLINE_ATTACHMENT_BYTES:
            logger.warning(
                "Skipping outbound Teams attachment over inline-size budget",
                name=name,
                size=len(raw),
                budget=MAX_INLINE_ATTACHMENT_BYTES,
            )
            return None
        encoded = base64.b64encode(raw).decode("ascii")
        return {
            "contentType": mime,
            "contentUrl": f"data:{mime};base64,{encoded}",
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
