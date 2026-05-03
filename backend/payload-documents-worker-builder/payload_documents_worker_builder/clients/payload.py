"""Tiny Payload CMS REST client used by built-in tasks.

The worker only needs:
* fetch the document context (file URL + parser knobs)
* download the binary attached to that document
* stamp parse results back (parsed_text / parse_status / parse_error / ...)

All Payload-side calls go through dedicated internal endpoints exposed by the
``payload-documents`` plugin and authenticated with the shared
``X-Internal-Secret`` header. Both endpoints use Payload's local API with
``overrideAccess: true`` server-side, so host apps can keep the documents
collection's access control honestly locked down (multi-tenant filters,
admin-only writes, etc.) without poking a service-account bypass into the
collection's access functions.

The ``api_token`` is still accepted for ``download_upload`` (which fetches
the binary blob through whatever URL Payload's upload adapter exposes — for
self-hosted uploads that's a Payload-served route which may need auth; for
external storage like R2/S3 the URL is public).
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
            raise PayloadError("Internal secret is required for plugin endpoints")
        self._base_url = base_url.rstrip("/")
        self._upload_headers = {"Authorization": f"Bearer {api_token}"}
        self._internal_headers = {"X-Internal-Secret": internal_secret}
        self._timeout = timeout

    async def fetch_parse_context(self, collection: str, doc_id: str | int) -> dict[str, Any]:
        """GET the plugin's internal read endpoint.

        Returns a projection containing only the fields the worker needs to
        drive the parse: ``id, url, filename, mimeType, language,
        parsing_instruction, mode``.
        """
        url = f"{self._base_url}/api/{collection}/{doc_id}/parse-context"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(url, headers=self._internal_headers)
        _raise_for_status(response, f"GET /{collection}/{doc_id}/parse-context")
        body: dict[str, Any] = response.json()
        return body

    async def download_upload(self, file_url: str) -> tuple[bytes, str]:
        """Fetch the binary attached to a Payload upload field.

        ``file_url`` is the absolute URL the document exposes (Payload-served
        route or external storage like R2/S3). Returns ``(content, filename)``.
        """
        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
            response = await client.get(file_url, headers=self._upload_headers)
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
            response = await client.post(url, headers=self._internal_headers, json=data)
        _raise_for_status(response, f"POST /{collection}/{doc_id}/parse-result")


def _raise_for_status(response: httpx.Response, op: str) -> None:
    if response.is_success:
        return
    detail = response.text[:500]
    raise PayloadError(f"Payload {op} failed: HTTP {response.status_code} — {detail}")
