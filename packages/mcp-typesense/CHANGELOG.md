# @zetesis/mcp-typesense

## 0.2.0

### Minor Changes

- [#10](https://github.com/Zetesis-Labs/PayloadAgents/pull/10) [`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad) Thanks [@Fiser12](https://github.com/Fiser12)! - added use of agno as main agent system

### Patch Changes

- [`0d4ec09`](https://github.com/Zetesis-Labs/PayloadAgents/commit/0d4ec09492d2c2ab21b7834a507eb1cf6b99bbae) - fix: surface silent failures in embeddings, taxonomy cache, and collection stats

  - Log OpenAI embedding errors instead of swallowing them silently
  - Throw on taxonomy mid-pagination failure instead of caching partial results; fall back to stale cache if available
  - Include error/error_message fields in collection stats when Typesense is unavailable

## 0.1.1

### Patch Changes

- [`02afa35`](https://github.com/Zetesis-Labs/PayloadAgents/commit/02afa352c24c7b61bb737af254b67d8b354d18af) - feat: first version zetesis mcp builder
