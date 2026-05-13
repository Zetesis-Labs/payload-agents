"""Teams attachment intake: download incoming files/images/audio/video and
wrap them as agno media so they reach the agent through ``agent.arun(...)``.

Two attachment shapes show up in practice:

1. **Inline media** (image/audio/video pasted into chat):
   ::
        {"contentType": "image/png",
         "contentUrl": "https://smba.../v3/attachments/...",
         "name": "image.png"}

   The ``contentUrl`` lives behind the bot connector and needs the bot's
   ``Bearer`` token.

2. **File via paperclip** (Teams file picker):
   ::
        {"contentType": "application/vnd.microsoft.teams.file.download.info",
         "name": "file.pdf",
         "content": {"downloadUrl": "https://...", "fileType": "pdf"}}

   The ``downloadUrl`` is a short-lived signed URL that does **not** need
   the bot token — it's a SharePoint pre-auth link.

Anything else (location cards, Adaptive Cards as input, mentions) is
ignored. ``download_attachments`` returns the kwargs ready to splat into
``agent.arun(text, **media_kwargs)`` plus a list of skip notices the
caller can prepend to the user-visible text.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog
from agno.media import Audio, File, Image, Video

logger = structlog.get_logger("agno_microsoft_teams.attachments")

TEAMS_FILE_DOWNLOAD_INFO = "application/vnd.microsoft.teams.file.download.info"
ATTACHMENT_DOWNLOAD_TIMEOUT_S = 30.0


async def download_attachments(
    *,
    attachments: list[dict[str, Any]],
    bot_token: str | None,
) -> tuple[dict[str, list[Any]], list[str]]:
    """Walk activity.attachments and produce media kwargs for ``agent.arun``.

    Returns ``(media_kwargs, skipped)``: ``media_kwargs`` is a dict with the
    ``images``/``audio``/``videos``/``files`` keys agno expects (only those
    that have at least one item); ``skipped`` is a list of human-readable
    reasons we couldn't ingest a particular attachment.
    """
    images: list[Image] = []
    audio: list[Audio] = []
    videos: list[Video] = []
    files: list[File] = []
    skipped: list[str] = []

    if not attachments:
        return {}, skipped

    async with httpx.AsyncClient(timeout=ATTACHMENT_DOWNLOAD_TIMEOUT_S) as client:
        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            try:
                handled = await _ingest_one(attachment, client=client, bot_token=bot_token)
            except Exception as exc:
                logger.warning(
                    "Teams attachment ingestion failed",
                    error=str(exc),
                    name=attachment.get("name"),
                )
                skipped.append(_skip_label(attachment, "download failed"))
                continue
            if handled is None:
                skipped.append(_skip_label(attachment, "unsupported type"))
                continue
            kind, media = handled
            if kind == "image":
                images.append(media)
            elif kind == "audio":
                audio.append(media)
            elif kind == "video":
                videos.append(media)
            elif kind == "file":
                files.append(media)

    out: dict[str, list[Any]] = {}
    if images:
        out["images"] = images
    if audio:
        out["audio"] = audio
    if videos:
        out["videos"] = videos
    if files:
        out["files"] = files
    return out, skipped


async def _ingest_one(
    attachment: dict[str, Any],
    *,
    client: httpx.AsyncClient,
    bot_token: str | None,
) -> tuple[str, Any] | None:
    content_type = attachment.get("contentType")
    if not isinstance(content_type, str):
        return None
    name = attachment.get("name") if isinstance(attachment.get("name"), str) else None

    if content_type == TEAMS_FILE_DOWNLOAD_INFO:
        return await _ingest_teams_file(attachment, client=client, name=name)

    content_url = attachment.get("contentUrl")
    if not isinstance(content_url, str) or not content_url:
        return None

    headers = {"Authorization": f"Bearer {bot_token}"} if bot_token else {}
    raw = (await client.get(content_url, headers=headers)).raise_for_status().content

    if content_type.startswith("image/"):
        return "image", Image(content=raw, mime_type=content_type)
    if content_type.startswith("audio/"):
        return "audio", Audio(content=raw, mime_type=content_type)
    if content_type.startswith("video/"):
        return "video", Video(content=raw, mime_type=content_type)
    return "file", _build_file(raw, mime_type=content_type, name=name)


async def _ingest_teams_file(
    attachment: dict[str, Any], *, client: httpx.AsyncClient, name: str | None
) -> tuple[str, Any] | None:
    content = attachment.get("content")
    if not isinstance(content, dict):
        return None
    download_url = content.get("downloadUrl")
    if not isinstance(download_url, str) or not download_url:
        return None
    raw = (await client.get(download_url)).raise_for_status().content

    file_type = content.get("fileType") if isinstance(content.get("fileType"), str) else None
    mime_type = _file_type_to_mime(file_type)
    if mime_type and mime_type.startswith("image/"):
        return "image", Image(content=raw, mime_type=mime_type)
    return "file", _build_file(raw, mime_type=mime_type, name=name)


def _build_file(raw: bytes, *, mime_type: str | None, name: str | None) -> File:
    """``File`` validates ``mime_type`` against a strict whitelist (see
    ``agno.media.File.valid_mime_types``); pass ``None`` when we're not
    sure so the agent layer keeps the bytes anyway and can still inspect.
    """
    valid = mime_type if mime_type in File.valid_mime_types() else None
    return File(content=raw, mime_type=valid, filename=name, name=name)


def _file_type_to_mime(file_type: str | None) -> str | None:
    if not file_type:
        return None
    mapping = {
        "pdf": "application/pdf",
        "txt": "text/plain",
        "json": "application/json",
        "csv": "text/csv",
        "html": "text/html",
        "xml": "text/xml",
        "md": "text/markdown",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "mp4": "video/mp4",
    }
    return mapping.get(file_type.lower())


def _skip_label(attachment: dict[str, Any], reason: str) -> str:
    name = attachment.get("name") or attachment.get("contentType") or "attachment"
    return f"{name} ({reason})"
