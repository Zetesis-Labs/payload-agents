---
'@zetesis/payload-indexer': patch
---

Three fixes that together make `afterChange` indexing correct out of the box:

**Refetch through the request transaction.** The `afterChange` hook now passes `req` to `payload.findByID` when repopulating, so the read joins the same transaction as the save that triggered the hook. Without this, Payload opens a new connection and reads the pre-commit snapshot, returning stale field values (e.g. the title from before the user's edit).

**Add `TableConfig.syncDepth`.** Payload calls `afterChange` with `depth=0`, so relationship fields arrive as IDs and any field `transform` that needs populated relations (e.g. extracting `slug` from a related taxonomy doc) silently produces empty output. Set `syncDepth: 1` (or higher) on a table config to make the hook refetch the doc with that depth before running transforms. Default `0` — existing consumers see no behavior change and no extra query. The hook picks the highest `syncDepth` across enabled tables for the collection so a single refetch covers all of them.

**Make the metadata-only optimization opt-in** via `EmbeddingTableConfig.reuseEmbeddingsWhenContentUnchanged` (default `false`). Previously, on `update` operations the syncer compared the content hash and, when unchanged, performed a partial update of mapped fields instead of re-chunking + re-embedding. That partial-update path can leave non-content fields stale in subtle ways. Default behavior is now to always run a full re-sync on update; consumers who have validated the partial path for their adapter and field set can opt in for the embedding-cost saving.
