---
'@zetesis/payload-documents': minor
---

Add `POST /:id/parse-result` internal write endpoint for the documents worker.

In worker mode the plugin now exposes a dedicated endpoint that the worker
calls to stamp parse results back onto a document, instead of having the
worker `PATCH /api/documents/:id` via the standard REST API. The endpoint:

- is only registered when `worker: { url, internalSecret }` is configured;
- authenticates with `X-Internal-Secret` (matched against the same
  `worker.internalSecret` the kicker validates);
- accepts only a hardcoded whitelist of fields: `parsed_text`,
  `parse_status`, `parse_error`, `parse_job_id`, `parsed_at`;
- writes via Payload's local API with `overrideAccess: true`.

This lets host apps keep the documents collection's `update` access control
honestly admin-only — no service-account bypass needs to be poked into
collection access functions for the worker to do its job. Trust between the
two services lives in one auditable handler instead of being scattered
across collection access controls.

Pairs with `payload-documents-worker-builder`'s new `submit_parse_result()`
client method, which targets this endpoint and replaces the previous direct
REST `PATCH` calls. Hosts already using worker mode pick this up
automatically by bumping the package and the worker library together; no
config changes required.
