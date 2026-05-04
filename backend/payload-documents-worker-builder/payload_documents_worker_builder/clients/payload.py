"""Tiny Payload CMS REST client used by built-in tasks.

The worker only needs:
* fetch the document context (parser knobs + filename)
* fetch the binary attached to that document
* stamp parse results back (parsed_text / parse_status / parse_error / ...)

All Payload-side calls go through dedicated internal endpoints exposed by the
``payload-documents`` plugin and authenticated with the shared
``X-Internal-Secret`` header. The endpoints use Payload's local API with
``overrideAccess: true`` server-side and the binary endpoint defers to a
host-provided resolver for the actual storage read, so the plugin stays
storage-agnostic and host apps can keep the documents collection's access
control honestly locked down (multi-tenant filters, admin-only writes, etc.)
without poking a service-account bypass into it.

The ``api_token`` is no longer used for any read on the documents
collection; it's kept on the constructor for future use (e.g. cross-collection
helpers). All three plugin endpoints use ``X-Internal-Secret``.
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
        self._api_token = api_token  # reserved for future cross-collection helpers
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

    async def fetch_parse_file(self, collection: str, doc_id: str | int) -> bytes:
        """GET the plugin's internal binary endpoint.

        The plugin defers the actual storage read to a host-provided resolver
        (S3/R2 GetObject, local fs, ...) and streams the result back.
        """
        url = f"{self._base_url}/api/{collection}/{doc_id}/parse-file"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(url, headers=self._internal_headers)
        _raise_for_status(response, f"GET /{collection}/{doc_id}/parse-file")
        return response.content

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
