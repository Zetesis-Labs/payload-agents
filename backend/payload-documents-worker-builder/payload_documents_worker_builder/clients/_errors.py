"""Shared error-handling helpers for HTTP clients in this package."""

from __future__ import annotations

from collections.abc import Callable

import httpx

_DETAIL_TRUNCATE = 500


def make_raise_for_status(
    exc_cls: type[Exception], prefix: str
) -> Callable[[httpx.Response, str], None]:
    """Return a `_raise_for_status(response, op)` bound to the given exception class + prefix.

    Each client (Payload, LlamaParse, …) wraps non-2xx responses in its own
    exception type but the rest of the logic is identical: format
    `<prefix> <op> failed: HTTP <code> — <body>` and raise.
    """

    def _raise_for_status(response: httpx.Response, op: str) -> None:
        if response.is_success:
            return
        detail = response.text[:_DETAIL_TRUNCATE]
        raise exc_cls(f"{prefix} {op} failed: HTTP {response.status_code} — {detail}")

    return _raise_for_status
