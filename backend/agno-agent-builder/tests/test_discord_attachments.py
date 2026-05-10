"""Tests for Discord attachment resolution from slash command interactions.

Discord delivers attachment-typed options as IDs whose payload lives under
``data.resolved.attachments``. We don't download — Discord's CDN URLs are
public and signed, so the resolver just classifies and wraps as agno media.
"""

from __future__ import annotations

from agno.media import File, Image
from agno_agent_builder.channels.discord.interface import _resolve_attachments


def _interaction_with(*, options: list[dict], resolved_attachments: dict) -> dict:
    return {
        "type": 2,
        "data": {
            "name": "chat",
            "options": options,
            "resolved": {"attachments": resolved_attachments},
        },
    }


def test_resolve_attachments_returns_empty_when_no_attachment_options() -> None:
    interaction = _interaction_with(
        options=[{"name": "message", "type": 3, "value": "hi"}],
        resolved_attachments={},
    )
    assert _resolve_attachments(interaction) == {}


def test_resolve_attachments_classifies_image() -> None:
    interaction = _interaction_with(
        options=[
            {"name": "message", "type": 3, "value": "describe"},
            {"name": "file", "type": 11, "value": "att-1"},
        ],
        resolved_attachments={
            "att-1": {
                "id": "att-1",
                "url": "https://cdn.discordapp.com/attachments/x/y/photo.png",
                "filename": "photo.png",
                "content_type": "image/png",
                "size": 12345,
            }
        },
    )
    media = _resolve_attachments(interaction)
    assert "images" in media
    assert len(media["images"]) == 1
    assert isinstance(media["images"][0], Image)
    assert media["images"][0].url == "https://cdn.discordapp.com/attachments/x/y/photo.png"
    assert media["images"][0].mime_type == "image/png"


def test_resolve_attachments_classifies_pdf_as_file() -> None:
    interaction = _interaction_with(
        options=[{"name": "file", "type": 11, "value": "att-1"}],
        resolved_attachments={
            "att-1": {
                "url": "https://cdn.discordapp.com/.../doc.pdf",
                "filename": "doc.pdf",
                "content_type": "application/pdf",
            }
        },
    )
    media = _resolve_attachments(interaction)
    assert "files" in media
    assert isinstance(media["files"][0], File)
    assert media["files"][0].mime_type == "application/pdf"
    assert media["files"][0].filename == "doc.pdf"


def test_resolve_attachments_drops_unknown_mime() -> None:
    """File class validates mime_type against a whitelist; unknown types
    fall through with mime_type=None so the agent still has the URL."""
    interaction = _interaction_with(
        options=[{"name": "file", "type": 11, "value": "att-1"}],
        resolved_attachments={
            "att-1": {
                "url": "https://cdn.discordapp.com/.../weird.bin",
                "filename": "weird.bin",
                "content_type": "application/x-weird",
            }
        },
    )
    media = _resolve_attachments(interaction)
    assert media["files"][0].mime_type is None


def test_resolve_attachments_handles_multiple_files() -> None:
    interaction = _interaction_with(
        options=[
            {"name": "file", "type": 11, "value": "img-1"},
            {"name": "file2", "type": 11, "value": "doc-1"},
        ],
        resolved_attachments={
            "img-1": {
                "url": "https://cdn.discordapp.com/.../a.jpg",
                "filename": "a.jpg",
                "content_type": "image/jpeg",
            },
            "doc-1": {
                "url": "https://cdn.discordapp.com/.../b.pdf",
                "filename": "b.pdf",
                "content_type": "application/pdf",
            },
        },
    )
    media = _resolve_attachments(interaction)
    assert len(media["images"]) == 1
    assert len(media["files"]) == 1


def test_resolve_attachments_skips_options_without_resolved_match() -> None:
    interaction = _interaction_with(
        options=[{"name": "file", "type": 11, "value": "missing"}],
        resolved_attachments={"other": {"url": "https://x"}},
    )
    assert _resolve_attachments(interaction) == {}
