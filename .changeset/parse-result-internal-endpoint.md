---
'@zetesis/payload-documents': minor
---

Add internal read + binary + write endpoints for the documents worker.

In worker mode the plugin now exposes three dedicated endpoints the worker
calls instead of going through the standard REST API for the document:

- `GET /:id/parse-context` — returns a hardcoded projection of the fields
  the worker needs to drive the parse: `id, url, filename, mimeType,
  language, parsing_instruction, mode`.
- `GET /:id/parse-file` — streams the upload binary back to the worker.
  Storage knowledge stays in the host: the plugin defers the actual fetch
  to a `worker.resolveFileBinary` callback supplied at plugin construction
  (S3/R2 hosts wire it to `s3.send(new GetObjectCommand(...))`; local-fs
  hosts read from disk; etc.). Endpoint is only registered when the
  resolver is provided.
- `POST /:id/parse-result` — accepts a hardcoded whitelist of writeable
  fields: `parsed_text, parse_status, parse_error, parse_job_id,
  parsed_at`.

All three are only registered when `worker: { url, internalSecret }` is
configured (parse-file additionally needs `resolveFileBinary`), all three
authenticate with `X-Internal-Secret` (matched against the same
`worker.internalSecret` the kicker validates), and all three call Payload's
local API with `overrideAccess: true`.

This lets host apps keep the documents collection's read + update access
honestly locked down (multi-tenant filters, admin-only writes, etc.) AND
keep upload URLs gated by Payload — no service-account bypass needs to be
poked into collection access, no public/signed file URLs need to be
exposed to bypass it. Trust between the two services lives in three small,
auditable handlers instead of being scattered across collection access
controls.

Pairs with `payload-documents-worker-builder`'s new `fetch_parse_context()`,
`fetch_parse_file()`, and `submit_parse_result()` client methods. Hosts
on worker mode that want the secure binary path bump the package and the
worker library together AND wire `worker.resolveFileBinary` in their
plugin config; hosts that opt to leave it unset keep the previous behavior
(worker fetches `doc.url` directly with its API token, which only works
when the host's storage adapter exposes the upload via a URL the worker
can reach without Payload-side access control).
