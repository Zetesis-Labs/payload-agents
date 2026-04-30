# @zetesis/payload-indexer

## 0.2.5

### Patch Changes

- [#42](https://github.com/Zetesis-Labs/PayloadAgents/pull/42) [`f875938`](https://github.com/Zetesis-Labs/PayloadAgents/commit/f875938212c0adc3e722aa6d76a2b9de75f0e82d) Thanks [@Fiser12](https://github.com/Fiser12)! - Three fixes that together make `afterChange` indexing correct out of the box:

  **Refetch through the request transaction.** The `afterChange` hook now passes `req` to `payload.findByID` when repopulating, so the read joins the same transaction as the save that triggered the hook. Without this, Payload opens a new connection and reads the pre-commit snapshot, returning stale field values (e.g. the title from before the user's edit).

  **Add `TableConfig.syncDepth`.** Payload calls `afterChange` with `depth=0`, so relationship fields arrive as IDs and any field `transform` that needs populated relations (e.g. extracting `slug` from a related taxonomy doc) silently produces empty output. Set `syncDepth: 1` (or higher) on a table config to make the hook refetch the doc with that depth before running transforms. Default `0` — existing consumers see no behavior change and no extra query. The hook picks the highest `syncDepth` across enabled tables for the collection so a single refetch covers all of them.

  **Make the metadata-only optimization opt-in** via `EmbeddingTableConfig.reuseEmbeddingsWhenContentUnchanged` (default `false`). Previously, on `update` operations the syncer compared the content hash and, when unchanged, performed a partial update of mapped fields instead of re-chunking + re-embedding. That partial-update path can leave non-content fields stale in subtle ways. Default behavior is now to always run a full re-sync on update; consumers who have validated the partial path for their adapter and field set can opt in for the embedding-cost saving.

## 0.2.3

### Patch Changes

- [#28](https://github.com/Zetesis-Labs/PayloadAgents/pull/28) [`c67fece`](https://github.com/Zetesis-Labs/PayloadAgents/commit/c67fecedd3ecd05e500fdbeada5a938bf10be191) Thanks [@Fiser12](https://github.com/Fiser12)! - Fix `defaultColumns` precedence so the per-collection `admin.defaultColumns` wins over the global `syncConfig.defaultColumns` (the global is now a fallback for collections that haven't picked their own list).

  Previously the global default silently overrode every indexed collection — e.g. `@zetesis/payload-documents` ships `['filename', 'parse_status', 'parsed_at']` but the host's global `['title', '_syncStatus', 'slug', 'categorias']` was applied instead, leaving only `_syncStatus` rendered (the other columns don't exist on the documents schema).

## 0.2.2

### Patch Changes

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`1a60057`](https://github.com/Zetesis-Labs/PayloadAgents/commit/1a600576986aaca58c70001e6144abd8dbf8e1f1) Thanks [@Fiser12](https://github.com/Fiser12)! - Distinguish "not indexed" from "lookup failed" in `checkBatchSyncStatus`.

  Previously, when Typesense was down or the adapter lacked
  `searchDocumentsByFilter`, every document in the batch came back as
  `'not-indexed'` — so the admin list view implied the index was empty
  instead of surfacing the outage.

  `getIndexedHashes` now returns a lookup shape with three distinct states
  (`hashes` / `errored` / `adapterUnsupported`). `checkBatchSyncStatus` maps
  those to `status: 'error'` with a descriptive `error` string, matching
  what the single-document `checkSyncStatus` already returns.

  Closes Zetesis-Labs/ZetesisPortal#107.

## 0.2.0

### Minor Changes

- [#10](https://github.com/Zetesis-Labs/PayloadAgents/pull/10) [`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad) Thanks [@Fiser12](https://github.com/Fiser12)! - added use of agno as main agent system

## 0.1.3

### Patch Changes

- [`c73a899`](https://github.com/Zetesis-Labs/PayloadAgents/commit/c73a89959dba50c31f5563bf21978952f7a8e3ce) - fix: issue regarding jsx tsdown build compilation

## 0.1.2

### Patch Changes

- [`2b1c2ca`](https://github.com/Zetesis-Labs/PayloadAgents/commit/2b1c2ca09ffe29d9b3be9a6528cc8fc5694e5284) - updated payloadcms to version 3.81.0

## 0.1.1

### Patch Changes

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - updated payload to 3.79.1

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - added requireTaxonomies to payload-typesense

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - changed react dependencies to 19^

## 0.1.0

### Patch Changes

- Initial release under @zetesis scope
