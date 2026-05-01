---
'@zetesis/payload-documents': minor
---

Add opt-in `worker` config to off-load LlamaParse to a queue worker.

When the new `worker: { url, internalSecret }` option is provided, the parse endpoint stops calling LlamaParse inline and instead `POST`s to `${url}/tasks/parse-document` with `{ document_id }` and an `X-Internal-Secret` header. The downstream worker (e.g. `backend/payload-worker` from `payload-worker-builder`) is responsible for downloading the upload, running the parse, polling LlamaCloud, and writing `parsed_text` / `parse_status` back via Payload REST. The `parse-status` endpoint becomes a passive read of the document's current status when worker mode is on, since the worker stamps the result directly.

When `worker` is omitted the legacy inline behavior is unchanged: `POST /:id/parse` uploads to LlamaParse from the Next.js process and `GET /:id/parse-status` polls LlamaCloud and updates the doc.

Exports a new `DocumentsWorkerConfig` type for consumers wiring the option from env.
