# @zetesis/payload-indexer

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
