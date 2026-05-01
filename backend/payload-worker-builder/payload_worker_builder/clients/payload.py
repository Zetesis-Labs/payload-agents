"""Tiny Payload CMS REST client used by built-in tasks.

The worker only needs:
* fetch the document doc (so we can resolve the upload URL + mode/language)
* download the binary attached to that document
* PATCH `parsed_text` / `parse_status` / `parse_error` back when finished

Authentication uses a Payload API key passed as ``Authorization: Bearer <token>``.
The token is provisioned out-of-band (Admin → users → API key); see README.
"""

from __future__ import annotations

from typing import Any

import httpx


class PayloadError(Exception):
    """Surfaced when Payload returns a non-2xx response."""


class PayloadClient:
    """Async REST client. One instance per task is fine; cheap to build."""

    def __init__(
        self,
        *,
        base_url: str,
        api_token: str,
        timeout: float = 60.0,
    ) -> None:
        if not base_url:
            raise PayloadError("Payload base URL is required")
        if not api_token:
            raise PayloadError("Payload API token is required")
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_token}"}
        self._timeout = timeout

    async def fetch_document(self, collection: str, doc_id: str | int) -> dict[str, Any]:
        url = f"{self._base_url}/api/{collection}/{doc_id}?depth=0"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(url, headers=self._headers)
        _raise_for_status(response, f"GET /{collection}/{doc_id}")
        body: dict[str, Any] = response.json()
        return body

    async def download_upload(self, file_url: str) -> tuple[bytes, str]:
        """Fetch the binary attached to a Payload upload field.

        ``file_url`` is the absolute URL Payload exposes (e.g.
        ``http://app:3000/api/uploads/file/foo.pdf``). Returns ``(content,
        filename)``.
        """
        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
            response = await client.get(file_url, headers=self._headers)
        _raise_for_status(response, f"GET {file_url}")
        # Use the URL's tail as filename; LlamaParse only cares about the extension.
        filename = file_url.rsplit("/", 1)[-1] or "upload.bin"
        return response.content, filename

    async def update_document(
        self,
        collection: str,
        doc_id: str | int,
        data: dict[str, Any],
    ) -> None:
        url = f"{self._base_url}/api/{collection}/{doc_id}?depth=0"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.patch(url, headers=self._headers, json=data)
        _raise_for_status(response, f"PATCH /{collection}/{doc_id}")


def _raise_for_status(response: httpx.Response, op: str) -> None:
    if response.is_success:
        return
    detail = response.text[:500]
    raise PayloadError(f"Payload {op} failed: HTTP {response.status_code} — {detail}")
