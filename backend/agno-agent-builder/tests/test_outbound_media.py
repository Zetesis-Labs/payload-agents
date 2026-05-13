"""Tests for outbound media translation: agno RunOutput-shaped responses
into Bot Framework attachments (Teams) and multipart upload tuples (Discord).

We don't drive the connectors — the helpers are pure functions over the
response shape. The interface modules' integration is exercised at the unit
boundary by relying on these helpers' contracts.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any

from agno.media import Audio, File, Image, Video
from agno_agent_builder.channels.discord.outbound_media import collect_outbound
from agno_microsoft_teams.outbound_media import (
    MAX_INLINE_ATTACHMENT_BYTES,
    build_attachments,
)


@dataclass
class _FakeResponse:
    """Stand-in for agno.run.agent.RunOutput.

    The real class has many other fields; the outbound helpers only consume
    the four media collections so a minimal shape is enough.
    """

    images: list[Any] = field(default_factory=list)
    videos: list[Any] = field(default_factory=list)
    audio: list[Any] = field(default_factory=list)
    files: list[Any] = field(default_factory=list)


# --- Teams ----------------------------------------------------------------


def test_teams_build_attachments_inlines_image_bytes_as_data_uri() -> None:
    response = _FakeResponse(images=[Image(content=b"PNGDATA", mime_type="image/png", id="a")])
    attachments = build_attachments(response)
    assert len(attachments) == 1
    expected_b64 = base64.b64encode(b"PNGDATA").decode()
    assert attachments[0]["contentType"] == "image/png"
    assert attachments[0]["contentUrl"] == f"data:image/png;base64,{expected_b64}"


def test_teams_build_attachments_passes_url_through_unchanged() -> None:
    response = _FakeResponse(
        images=[Image(url="https://example.com/img.jpg", mime_type="image/jpeg", id="b")]
    )
    attachments = build_attachments(response)
    assert len(attachments) == 1
    assert attachments[0]["contentUrl"] == "https://example.com/img.jpg"


def test_teams_build_attachments_skips_oversized_inline() -> None:
    big = b"x" * (MAX_INLINE_ATTACHMENT_BYTES + 1)
    response = _FakeResponse(images=[Image(content=big, mime_type="image/png", id="c")])
    attachments = build_attachments(response)
    assert attachments == []


def test_teams_build_attachments_handles_files_pdf() -> None:
    response = _FakeResponse(
        files=[File(content=b"PDFDATA", mime_type="application/pdf", filename="report.pdf")]
    )
    attachments = build_attachments(response)
    assert len(attachments) == 1
    assert attachments[0]["contentType"] == "application/pdf"
    assert attachments[0]["name"] == "report.pdf"
    assert attachments[0]["contentUrl"].startswith("data:application/pdf;base64,")


def test_teams_build_attachments_returns_empty_for_no_media() -> None:
    response = _FakeResponse()
    assert build_attachments(response) == []


def test_teams_build_attachments_handles_response_without_attrs() -> None:
    """The helper must not crash if the response is a stub without the
    full agno schema (e.g. an early-exit path or a different framework)."""

    class Bare:
        pass

    assert build_attachments(Bare()) == []


# --- Discord --------------------------------------------------------------


def test_discord_collect_outbound_separates_bytes_and_urls() -> None:
    response = _FakeResponse(
        images=[
            Image(content=b"PNGDATA", mime_type="image/png", id="d"),
            Image(url="https://cdn.example/external.jpg", mime_type="image/jpeg", id="e"),
        ],
        files=[File(content=b"PDFDATA", mime_type="application/pdf", filename="r.pdf")],
    )
    files, urls = collect_outbound(response)

    assert len(files) == 2
    assert files[0][0]  # filename auto-defaulted to "image.png"
    assert files[0][1] == b"PNGDATA"
    assert files[0][2] == "image/png"
    assert files[1] == ("r.pdf", b"PDFDATA", "application/pdf")

    assert urls == ["https://cdn.example/external.jpg"]


def test_discord_collect_outbound_classifies_video_and_audio_defaults() -> None:
    response = _FakeResponse(
        videos=[Video(content=b"MP4DATA", id="v")],
        audio=[Audio(content=b"MP3DATA", id="a")],
    )
    files, urls = collect_outbound(response)
    assert urls == []
    assert len(files) == 2
    assert files[0][2] == "video/mp4"
    assert files[1][2] == "audio/mpeg"


def test_discord_collect_outbound_returns_empty_for_no_media() -> None:
    files, urls = collect_outbound(_FakeResponse())
    assert files == []
    assert urls == []
