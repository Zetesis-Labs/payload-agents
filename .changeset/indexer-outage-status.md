---
'@zetesis/payload-indexer': patch
---

Distinguish "not indexed" from "lookup failed" in `checkBatchSyncStatus`.

Previously, when Typesense was down or the adapter lacked
`searchDocumentsByFilter`, every document in the batch came back as
`'not-indexed'` — so the admin list view implied the index was empty
instead of surfacing the outage.

`getIndexedHashes` now returns a lookup shape with three distinct states
(`hashes` / `errored` / `adapterUnsupported`). `checkBatchSyncStatus` maps
those to `status: 'error'` with a descriptive `error` string, matching
what the single-document `checkSyncStatus` already returns.

Closes Zetesis-Labs/ZetesisPortal#107.
