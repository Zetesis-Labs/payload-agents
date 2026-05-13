"""Tests for outbound media translation into Bot Framework attachments."""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any

from agno.media import File, Image
from agno_microsoft_teams.outbound_media import (
    MAX_INLINE_ATTACHMENT_BYTES,
    build_attachments,
)


@dataclass
class _FakeResponse:
    images: list[Any] = field(default_factory=list)
    videos: list[Any] = field(default_factory=list)
    audio: list[Any] = field(default_factory=list)
    files: list[Any] = field(default_factory=list)


def test_build_attachments_inlines_image_bytes_as_data_uri() -> None:
    response = _FakeResponse(images=[Image(content=b"PNGDATA", mime_type="image/png", id="a")])
    attachments = build_attachments(response)
    assert len(attachments) == 1
    expected_b64 = base64.b64encode(b"PNGDATA").decode()
    assert attachments[0]["contentType"] == "image/png"
    assert attachments[0]["contentUrl"] == f"data:image/png;base64,{expected_b64}"


def test_build_attachments_passes_url_through_unchanged() -> None:
    response = _FakeResponse(
        images=[Image(url="https://example.com/img.jpg", mime_type="image/jpeg", id="b")]
    )
    attachments = build_attachments(response)
    assert len(attachments) == 1
    assert attachments[0]["contentUrl"] == "https://example.com/img.jpg"


def test_build_attachments_skips_oversized_inline() -> None:
    big = b"x" * (MAX_INLINE_ATTACHMENT_BYTES + 1)
    response = _FakeResponse(images=[Image(content=big, mime_type="image/png", id="c")])
    attachments = build_attachments(response)
    assert attachments == []


def test_build_attachments_skips_when_base64_data_uri_exceeds_budget() -> None:
    raw = b"x" * ((MAX_INLINE_ATTACHMENT_BYTES * 3) // 4)
    response = _FakeResponse(images=[Image(content=raw, mime_type="image/png", id="c")])
    attachments = build_attachments(response)
    assert attachments == []


def test_build_attachments_handles_files_pdf() -> None:
    response = _FakeResponse(
        files=[File(content=b"PDFDATA", mime_type="application/pdf", filename="report.pdf")]
    )
    attachments = build_attachments(response)
    assert len(attachments) == 1
    assert attachments[0]["contentType"] == "application/pdf"
    assert attachments[0]["name"] == "report.pdf"
    assert attachments[0]["contentUrl"].startswith("data:application/pdf;base64,")


def test_build_attachments_returns_empty_for_no_media() -> None:
    response = _FakeResponse()
    assert build_attachments(response) == []


def test_build_attachments_handles_response_without_attrs() -> None:
    class Bare:
        pass

    assert build_attachments(Bare()) == []
