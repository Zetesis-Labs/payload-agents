---
'@zetesis/payload-documents': patch
---

Address three issues raised in the Devin review of PR #24:

- **Treat `CANCELED` LlamaParse jobs as terminal.** `resolveJob` in the parse-status endpoint previously fell through to `handleProcessing` for any status other than `SUCCESS`/`ERROR`, including `CANCELED`. Canceled jobs never transition to `SUCCESS` or `ERROR`, so the document stayed in `processing` and the client polled forever. Canceled jobs now surface as `parse_status='error'` with the message "LlamaParse job was canceled" (overridable by the API's own `error_message`).
- **Fail-fast when the uploaded file URL cannot be resolved.** `fetchUploadedFile` used to fall back to an empty `serverURL`, which turned a relative upload URL into a path-only string and blew up Node's `fetch` with a cryptic `TypeError: Invalid URL`. It now returns a clear 500 (`"Payload serverURL is not configured and the uploaded file URL is relative"`) when the URL is relative and no `serverURL` is set.
- **Clean up the polling interval on unmount.** `ParseButtonField` started a `setInterval` via `startPolling` but never cleared it when the component unmounted. If the user navigated away mid-parse, the interval kept firing, called `setState` on an unmounted component, and could trigger `window.location.reload()` after navigation. Added a `useEffect` cleanup that always clears the interval on unmount.
