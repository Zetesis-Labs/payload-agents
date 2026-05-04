"""Minimal async LlamaParse client.

Ported from `packages/payload-documents/src/llama-parse/client.ts`. Only the
endpoints the parse-document task needs:

* ``POST /api/parsing/upload``       — kick off a parse job
* ``GET  /api/parsing/job/{id}``     — poll status
* ``GET  /api/parsing/job/{id}/result/markdown`` — fetch parsed markdown

Use as an async context manager so the underlying ``httpx.AsyncClient`` (and
its connection pool) is shared across all calls within one task instead of a
new TLS handshake per request::

    async with LlamaParseClient(api_key=...) as client:
        job = await client.upload(...)
        ...
"""

from __future__ import annotations

from dataclasses import dataclass
from types import TracebackType
from typing import Any, Literal, Self

import httpx

from ._errors import make_raise_for_status

LlamaParseStatus = Literal["PENDING", "SUCCESS", "ERROR", "CANCELLED"]
DEFAULT_BASE_URL = "https://api.cloud.llamaindex.ai"


class LlamaParseError(Exception):
    """Wraps any non-2xx response or transport failure with a helpful message."""


_raise_for_status = make_raise_for_status(LlamaParseError, "LlamaParse")


@dataclass(slots=True)
class LlamaParseJob:
    id: str
    status: LlamaParseStatus
    error: str | None = None


class LlamaParseClient:
    """Tiny httpx-backed client. Use via ``async with`` to share the httpx pool."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 60.0,
    ) -> None:
        if not api_key:
            raise LlamaParseError("LlamaParse API key is required")
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._timeout = timeout
        self._http: httpx.AsyncClient | None = None

    async def __aenter__(self) -> Self:
        self._http = httpx.AsyncClient(timeout=self._timeout)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def upload(
        self,
        *,
        file_bytes: bytes,
        filename: str,
        language: str | None = None,
        parsing_instruction: str | None = None,
        mode: str | None = None,
    ) -> LlamaParseJob:
        data: dict[str, Any] = {}
        if language is not None:
            data["language"] = language
        if parsing_instruction is not None:
            data["parsing_instruction"] = parsing_instruction
        if mode is not None:
            data["parse_mode"] = mode

        response = await self._client().post(
            f"{self._base_url}/api/parsing/upload",
            headers=self._headers,
            files={"file": (filename, file_bytes)},
            data=data,
        )
        _raise_for_status(response, "upload")
        return _parse_job(response.json())

    async def status(self, job_id: str) -> LlamaParseJob:
        response = await self._client().get(
            f"{self._base_url}/api/parsing/job/{job_id}",
            headers=self._headers,
        )
        _raise_for_status(response, "status")
        return _parse_job(response.json())

    async def fetch_markdown(self, job_id: str) -> str:
        response = await self._client().get(
            f"{self._base_url}/api/parsing/job/{job_id}/result/markdown",
            headers=self._headers,
        )
        _raise_for_status(response, "fetch_markdown")
        markdown = response.json().get("markdown")
        if not isinstance(markdown, str):
            raise LlamaParseError(f"LlamaParse returned no markdown for job {job_id}")
        return markdown

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            raise LlamaParseError(
                "LlamaParseClient must be used inside `async with` (httpx pool not initialised)"
            )
        return self._http


def _parse_job(payload: dict[str, Any]) -> LlamaParseJob:
    return LlamaParseJob(
        id=payload["id"],
        status=payload.get("status", "PENDING"),
        error=payload.get("error"),
    )
