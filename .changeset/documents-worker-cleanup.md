---
'@zetesis/payload-documents': patch
---

Cleanup pass on the documents-worker code paths introduced in 0.4.0.

Plugin (TypeScript):

- Extracts the `requireInternalSecret` helper to `endpoints/shared.ts` so the
  three internal endpoints (`parse-context`, `parse-result`, `parse-file`)
  share one definition instead of three verbatim copies.
- Adds `fetchInternalDocument` for the `findByID` + `overrideAccess: true` +
  try/catch pattern the read endpoints all repeat; consolidated into one
  `loadDocument` underneath `fetchDocument` and `fetchInternalDocument`.
- Moves `fetchUploadedFile` and `getLlamaParseClient` out of `shared.ts` into
  a new `endpoints/inline-helpers.ts` — they're only used by the inline
  parse + parse-status paths, not by the worker endpoints.
- `DocumentRecord` moves to `plugin/types.ts` so `ResolveFileBinary.doc` can
  use it instead of `Record<string, unknown>` (host callbacks now get
  autocompletion). Drops the duplicate internal `WorkerEndpointConfig` in
  favour of the public `DocumentsWorkerConfig`.
- `parse-endpoint.ts` no longer ships the now-invalid `'default'` mode
  fallback to LlamaParse; passes `undefined` (the API picks its own default).
- Drops a dead JSDoc-density block on the loopback URL rewrite by extracting
  it to a private helper in `inline-helpers.ts`.

No behavioural changes for the public surface (`createDocumentsPlugin`,
`buildDocumentsCollection`, the published types).
