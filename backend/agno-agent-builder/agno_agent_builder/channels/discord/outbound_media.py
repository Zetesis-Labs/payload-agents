"""Outbound media for Discord: turn agno ``RunOutput`` media into the
``files``/``payload_json`` shape the interaction follow-up endpoint expects.

Discord supports ``multipart/form-data`` on the @original PATCH:

* ``files[N]`` parts upload bytes — used for everything that has
  ``Image.content`` / ``File.content`` etc.
* URL-only media (a tool returned an external URL) is dropped in the text
  body; Discord auto-embeds image/video URLs and adds a clickable link
  for arbitrary files. Cheaper than re-downloading and re-uploading.

Discord's per-message upload cap is 25 MB on the free tier — we don't try
to enforce it client-side; the connector returns 413 if you exceed it and
we surface the error in logs.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import structlog
from agno.media import Audio, File, Image, Video

logger = structlog.get_logger("agno_agent_builder.channels.discord.outbound_media")


def collect_outbound(response: Any) -> tuple[list[tuple[str, bytes, str]], list[str]]:
    """Walk all media collections on the agno response and split into:

    * ``files`` — list of ``(filename, raw_bytes, mime_type)`` ready to drop
      into ``httpx.AsyncClient.patch(files=…)``.
    * ``url_suffixes`` — extra text lines (URLs) the caller can append to the
      message content so Discord auto-embeds them.
    """
    files: list[tuple[str, bytes, str]] = []
    url_suffixes: list[str] = []
    for media, default_mime, default_name in _iter_response_media(response):
        url = getattr(media, "url", None)
        if isinstance(url, str) and url:
            url_suffixes.append(url)
            continue
        raw = getattr(media, "content", None)
        if not isinstance(raw, bytes) or not raw:
            continue
        name = _media_name(media, default_name)
        mime = getattr(media, "mime_type", None) or default_mime
        files.append((name, raw, mime))
    return files, url_suffixes


def _iter_response_media(response: Any) -> Iterable[tuple[Any, str, str]]:
    for items, default_mime, default_name in (
        (getattr(response, "images", None) or (), "image/png", "image.png"),
        (getattr(response, "videos", None) or (), "video/mp4", "video.mp4"),
        (getattr(response, "audio", None) or (), "audio/mpeg", "audio.mp3"),
        (getattr(response, "files", None) or (), "application/octet-stream", "file.bin"),
    ):
        for item in items:
            yield item, default_mime, default_name


def _media_name(media: Any, fallback: str) -> str:
    for attr in ("filename", "name"):
        value = getattr(media, attr, None)
        if isinstance(value, str) and value:
            return value
    if isinstance(media, Image):
        return "image.png"
    if isinstance(media, Video):
        return "video.mp4"
    if isinstance(media, Audio):
        return "audio.mp3"
    if isinstance(media, File):
        return "file.bin"
    return fallback
