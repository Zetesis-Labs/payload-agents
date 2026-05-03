---
'@zetesis/payload-documents': minor
---

Add internal read + write endpoints for the documents worker.

In worker mode the plugin now exposes two dedicated endpoints the worker
calls instead of going through the standard REST API for the document:

- `GET /:id/parse-context` — returns a hardcoded projection of the fields
  the worker needs to drive the parse: `id, url, filename, mimeType,
  language, parsing_instruction, mode`.
- `POST /:id/parse-result` — accepts a hardcoded whitelist of writeable
  fields: `parsed_text, parse_status, parse_error, parse_job_id,
  parsed_at`.

Both are only registered when `worker: { url, internalSecret }` is
configured, both authenticate with `X-Internal-Secret` (matched against
the same `worker.internalSecret` the kicker validates), and both call
Payload's local API with `overrideAccess: true`.

This lets host apps keep the documents collection's read + update access
honestly locked down (multi-tenant filters, admin-only writes, etc.) — no
service-account bypass needs to be poked into collection access functions
for the worker to do its job. Trust between the two services lives in two
small, auditable handlers instead of being scattered across collection
access controls.

Pairs with `payload-documents-worker-builder`'s new `fetch_parse_context()`
and `submit_parse_result()` client methods, which target these endpoints
and replace the previous direct REST `GET` and `PATCH` calls. Hosts
already using worker mode pick this up automatically by bumping the
package and the worker library together; no config changes required.
