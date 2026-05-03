"""Tiny Payload CMS REST client used by built-in tasks.

The worker only needs:
* fetch the document doc (so we can resolve the upload URL + mode/language)
* download the binary attached to that document
* stamp parse results back (parsed_text / parse_status / parse_error / ...)

Two auth modes are used, by design:

* **Reads** (``fetch_document``, ``download_upload``) go through the standard
  Payload REST API authenticated by a service-account API token
  (``Authorization: Bearer <token>``). Reads are typically open to any
  authenticated user, so the API token is sufficient and the worker doesn't
  need elevated rights.
* **Writes** (``submit_parse_result``) go through the plugin's internal
  write endpoint (``POST /:id/parse-result``) authenticated by the shared
  ``X-Internal-Secret`` header. The endpoint validates the secret and uses
  Payload's local API with ``overrideAccess: true``, so the host app's
  documents collection can stay honestly admin-only without poking
  service-account bypasses into its access control.
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
        internal_secret: str,
        timeout: float = 60.0,
    ) -> None:
        if not base_url:
            raise PayloadError("Payload base URL is required")
        if not api_token:
            raise PayloadError("Payload API token is required")
        if not internal_secret:
            raise PayloadError("Internal secret is required (used for write-back)")
        self._base_url = base_url.rstrip("/")
        self._read_headers = {"Authorization": f"Bearer {api_token}"}
        self._write_headers = {"X-Internal-Secret": internal_secret}
        self._timeout = timeout

    async def fetch_document(self, collection: str, doc_id: str | int) -> dict[str, Any]:
        url = f"{self._base_url}/api/{collection}/{doc_id}?depth=0"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(url, headers=self._read_headers)
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
            response = await client.get(file_url, headers=self._read_headers)
        _raise_for_status(response, f"GET {file_url}")
        # Use the URL's tail as filename; LlamaParse only cares about the extension.
        filename = file_url.rsplit("/", 1)[-1] or "upload.bin"
        return response.content, filename

    async def submit_parse_result(
        self,
        collection: str,
        doc_id: str | int,
        data: dict[str, Any],
    ) -> None:
        """POST to the plugin's internal write endpoint.

        Body is whitelisted server-side; only the parse_* fields are accepted
        regardless of what we send.
        """
        url = f"{self._base_url}/api/{collection}/{doc_id}/parse-result"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(url, headers=self._write_headers, json=data)
        _raise_for_status(response, f"POST /{collection}/{doc_id}/parse-result")


def _raise_for_status(response: httpx.Response, op: str) -> None:
    if response.is_success:
        return
    detail = response.text[:500]
    raise PayloadError(f"Payload {op} failed: HTTP {response.status_code} — {detail}")
