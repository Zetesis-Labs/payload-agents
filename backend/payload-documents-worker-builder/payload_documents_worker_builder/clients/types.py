"""Typed dicts for the JSON contracts the Payload plugin endpoints expose.

Mirrors the TypeScript types in `packages/payload-documents/src/plugin/types.ts`
and `endpoints/parse-{context,result}-endpoint.ts`. Worth duplicating because
the alternative — `dict[str, Any]` everywhere — drops type info at every
boundary.
"""

from __future__ import annotations

from typing import Literal, NotRequired, TypedDict

ParseStatus = Literal["idle", "pending", "processing", "done", "error"]


class ParseContext(TypedDict):
    """Response shape of `GET /api/<collection>/<id>/parse-context`.

    Field set is hard-coded server-side (see `parse-context-endpoint.ts`); the
    plugin only returns what the worker needs to drive the LlamaParse upload.
    """

    id: str | int
    url: NotRequired[str | None]
    filename: NotRequired[str | None]
    mimeType: NotRequired[str | None]
    language: NotRequired[str | None]
    parsing_instruction: NotRequired[str | None]
    mode: NotRequired[str | None]


class ParseResultUpdate(TypedDict, total=False):
    """Request body for `POST /api/<collection>/<id>/parse-result`.

    Fields are whitelisted server-side (see `parse-result-endpoint.ts`); any
    keys outside this set are silently dropped, but typing them here means the
    caller catches typos at lint/check time.
    """

    parsed_text: str | None
    parse_status: ParseStatus
    parse_error: str | None
    parse_job_id: str | None
    parsed_at: str | None
