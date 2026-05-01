"""Minimal async LlamaParse client.

Ported from `packages/payload-documents/src/llama-parse/client.ts`. Only the
endpoints the parse-document task needs:

* ``POST /api/parsing/upload``       — kick off a parse job
* ``GET  /api/parsing/job/{id}``     — poll status
* ``GET  /api/parsing/job/{id}/result/markdown`` — fetch parsed markdown
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import httpx

LlamaParseStatus = Literal["PENDING", "SUCCESS", "ERROR", "CANCELLED"]


class LlamaParseError(Exception):
    """Wraps any non-2xx response or transport failure with a helpful message."""


@dataclass(slots=True)
class LlamaParseJob:
    id: str
    status: LlamaParseStatus
    error: str | None = None


class LlamaParseClient:
    """Tiny httpx-backed client. One instance per task is fine; cheap to build."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.cloud.llamaindex.ai",
        timeout: float = 60.0,
    ) -> None:
        if not api_key:
            raise LlamaParseError("LlamaParse API key is required")
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._timeout = timeout

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
        if language:
            data["language"] = language
        if parsing_instruction:
            data["parsing_instruction"] = parsing_instruction
        if mode:
            data["parse_mode"] = mode

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(
                f"{self._base_url}/api/parsing/upload",
                headers=self._headers,
                files={"file": (filename, file_bytes)},
                data=data,
            )
        _raise_for_status(response, "upload")
        payload = response.json()
        return LlamaParseJob(id=payload["id"], status=payload.get("status", "PENDING"))

    async def status(self, job_id: str) -> LlamaParseJob:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(
                f"{self._base_url}/api/parsing/job/{job_id}",
                headers=self._headers,
            )
        _raise_for_status(response, "status")
        payload = response.json()
        return LlamaParseJob(
            id=payload["id"],
            status=payload.get("status", "PENDING"),
            error=payload.get("error"),
        )

    async def fetch_markdown(self, job_id: str) -> str:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(
                f"{self._base_url}/api/parsing/job/{job_id}/result/markdown",
                headers=self._headers,
            )
        _raise_for_status(response, "fetch_markdown")
        payload = response.json()
        markdown = payload.get("markdown")
        if not isinstance(markdown, str):
            raise LlamaParseError(f"LlamaParse returned no markdown for job {job_id}")
        return markdown


def _raise_for_status(response: httpx.Response, op: str) -> None:
    if response.is_success:
        return
    detail = response.text[:500]
    raise LlamaParseError(
        f"LlamaParse {op} failed: HTTP {response.status_code} — {detail}"
    )
