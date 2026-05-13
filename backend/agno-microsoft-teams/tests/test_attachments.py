"""Tests for the Teams attachment intake. The agno media classes don't reach
out to the network when bytes are provided up front, so we drive the
end-to-end download by mocking the httpx.AsyncClient calls.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from agno_microsoft_teams.attachments import (
    TEAMS_FILE_DOWNLOAD_INFO,
    download_attachments,
)


class _FakeClient:
    """Minimal stand-in for httpx.AsyncClient used as a context manager.

    Returns canned responses from a (url, body, status) registry; failures
    are surfaced as httpx.HTTPError so the production code's exception path
    is exercised the same way it would be in flight.
    """

    def __init__(self, registry: dict[str, tuple[bytes, int]]) -> None:
        self._registry = registry

    async def __aenter__(self) -> _FakeClient:
        return self

    async def __aexit__(self, *_a: Any) -> None:
        return None

    async def get(self, url: str, headers: dict[str, str] | None = None) -> httpx.Response:
        if url not in self._registry:
            raise httpx.HTTPError(f"unexpected URL: {url}")
        body, status = self._registry[url]
        request = httpx.Request("GET", url)
        return httpx.Response(status_code=status, content=body, request=request)


@pytest.fixture
def patch_async_client(monkeypatch: pytest.MonkeyPatch) -> Any:
    def _patch(registry: dict[str, tuple[bytes, int]]) -> None:
        monkeypatch.setattr(
            "agno_microsoft_teams.attachments.httpx.AsyncClient",
            lambda timeout=None: _FakeClient(registry),
        )

    return _patch


@pytest.mark.asyncio
async def test_download_attachments_handles_inline_image(patch_async_client: Any) -> None:
    patch_async_client({"https://smba.example/v3/attachments/img1": (b"PNGDATA", 200)})

    media, skipped = await download_attachments(
        attachments=[
            {
                "contentType": "image/png",
                "contentUrl": "https://smba.example/v3/attachments/img1",
                "name": "image.png",
            }
        ],
        bot_token="bot-token",
    )

    assert "images" in media
    assert len(media["images"]) == 1
    image = media["images"][0]
    assert image.content == b"PNGDATA"
    assert image.mime_type == "image/png"
    assert skipped == []


@pytest.mark.asyncio
async def test_download_attachments_handles_teams_file_download_info(
    patch_async_client: Any,
) -> None:
    patch_async_client({"https://sharepoint.example/file.pdf": (b"PDFDATA", 200)})

    media, skipped = await download_attachments(
        attachments=[
            {
                "contentType": TEAMS_FILE_DOWNLOAD_INFO,
                "name": "manual.pdf",
                "content": {
                    "downloadUrl": "https://sharepoint.example/file.pdf",
                    "fileType": "pdf",
                },
            }
        ],
        bot_token="bot-token",
    )

    assert "files" in media
    assert len(media["files"]) == 1
    file_obj = media["files"][0]
    assert file_obj.content == b"PDFDATA"
    assert file_obj.mime_type == "application/pdf"
    assert file_obj.filename == "manual.pdf"
    assert skipped == []


@pytest.mark.asyncio
async def test_download_attachments_classifies_image_via_teams_file_picker(
    patch_async_client: Any,
) -> None:
    patch_async_client({"https://sharepoint.example/photo.jpg": (b"JPGDATA", 200)})

    media, _ = await download_attachments(
        attachments=[
            {
                "contentType": TEAMS_FILE_DOWNLOAD_INFO,
                "name": "photo.jpg",
                "content": {
                    "downloadUrl": "https://sharepoint.example/photo.jpg",
                    "fileType": "jpg",
                },
            }
        ],
        bot_token="bot-token",
    )

    assert "images" in media
    assert media["images"][0].mime_type == "image/jpeg"


@pytest.mark.asyncio
async def test_download_attachments_skips_unsupported_type(
    patch_async_client: Any,
) -> None:
    patch_async_client({})

    media, skipped = await download_attachments(
        attachments=[{"contentType": "application/vnd.microsoft.card.adaptive"}],
        bot_token="bot-token",
    )

    assert media == {}
    assert len(skipped) == 1
    assert "unsupported" in skipped[0]


@pytest.mark.asyncio
async def test_download_attachments_records_failure_when_download_breaks(
    patch_async_client: Any,
) -> None:
    patch_async_client({})

    media, skipped = await download_attachments(
        attachments=[
            {
                "contentType": "image/png",
                "contentUrl": "https://smba.example/missing",
                "name": "broken.png",
            }
        ],
        bot_token="bot-token",
    )

    assert media == {}
    assert len(skipped) == 1
    assert "broken.png" in skipped[0]


@pytest.mark.asyncio
async def test_download_attachments_returns_empty_for_no_attachments() -> None:
    media, skipped = await download_attachments(attachments=[], bot_token="bot-token")
    assert media == {}
    assert skipped == []


@pytest.mark.asyncio
async def test_download_attachments_drops_unknown_filetype_mime(patch_async_client: Any) -> None:
    """Unknown fileType from Teams (e.g. 'docx') gets passed as File with
    mime_type=None so the agent layer still has the bytes to sniff."""
    patch_async_client({"https://sharepoint.example/file.docx": (b"DOCXDATA", 200)})

    media, _ = await download_attachments(
        attachments=[
            {
                "contentType": TEAMS_FILE_DOWNLOAD_INFO,
                "name": "report.docx",
                "content": {
                    "downloadUrl": "https://sharepoint.example/file.docx",
                    "fileType": "docx",
                },
            }
        ],
        bot_token="bot-token",
    )

    assert "files" in media
    assert media["files"][0].mime_type is None
    assert media["files"][0].content == b"DOCXDATA"
