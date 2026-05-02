# @zetesis/mcp-typesense

## 0.3.0

### Minor Changes

- [#51](https://github.com/Zetesis-Labs/PayloadAgents/pull/51) [`3ebb6c0`](https://github.com/Zetesis-Labs/PayloadAgents/commit/3ebb6c0b297be36973c3c94876a8afdd3ebd9471) Thanks [@Fiser12](https://github.com/Fiser12)! - Drop client-side embedding path across the indexer, the Typesense plugin,
  and the MCP server. `autoEmbed` is now the only embedding mode.

  The search backend (Typesense) generates every vector — on upsert from the
  fields listed in `embedding.autoEmbed.from`, and on search from the `q`
  parameter using the model declared in the collection schema. None of the
  three packages call an embedding API directly.

  **`@zetesis/payload-indexer` breaking changes**

  - `EmbeddingTableConfig.autoEmbed` is now required when `embedding` is set.
  - `AutoEmbedConfig.modelConfig` is now backend-agnostic
    (`Record<string, unknown>`) — adapter packages declare their own typed
    shapes (e.g. `TypesenseAutoEmbedConfig` in `@zetesis/payload-typesense`).
  - Removed `EmbeddingTableConfig.provider`,
    `EmbeddingTableConfig.onEmbeddingFailure`, and
    `EmbeddingTableConfig.reuseEmbeddingsWhenContentUnchanged` (the
    content-hash optimization is now always-on; bypass via
    `req.context.forceReindex` or `SyncOptions.forceReindex`).
  - Removed `IndexerFeatureConfig.embedding`.
  - Removed `IndexerPluginResult.embeddingService` and
    `IndexerPluginResult.embeddingResolver`.
  - Removed exports: `EmbeddingService`, `EmbeddingServiceImpl`,
    `EmbeddingProvider`, `EmbeddingProviderConfig`, `EmbeddingProviderType`,
    `EmbeddingResult`, `EmbeddingUsage`, `BatchEmbeddingResult`,
    `OpenAIProviderConfig`, `OpenAIEmbeddingProvider`, `OpenAIEmbeddingModel`,
    `GeminiProviderConfig`, `GeminiEmbeddingProvider`, `GeminiEmbeddingModel`,
    `EmbeddingFailureBehavior`, `EmbeddingResolver`, `createEmbeddingService`,
    `DEFAULT_EMBEDDING_MODEL`, `DEFAULT_GEMINI_EMBEDDING_MODEL`,
    `DEFAULT_EMBEDDING_DIMENSIONS`, `MIN_EMBEDDING_TEXT_LENGTH`.
  - `syncDocumentToIndex` no longer accepts an `embeddingService` argument.
    Same for `DocumentSyncer`. `syncDocumentToIndex` and `DocumentSyncer`
    accept an optional `SyncOptions { forceReindex?: boolean }` to bypass the
    content-hash optimization.
  - `applySyncHooks` no longer accepts an `embeddingResolver` argument.
  - `createSyncStatusEndpoints` no longer accepts an `embeddingService`
    argument.
  - Removed `@google/generative-ai` from dependencies.

  The content-hash optimization runs unconditionally: when an update's
  source-text hash matches the stored one, the indexer issues a partial
  metadata update via `updateDocumentsByFilter` (chunks) or `updateDocument`
  (single docs), skipping the re-chunk/re-upsert and the backend's
  re-embedding cost. Adapters that don't implement those partial-update
  methods fall back to the full re-sync path automatically. Bypass with
  `req.context.forceReindex = true` or `SyncOptions.forceReindex`.

  **`@zetesis/payload-typesense` breaking changes**

  - Removed `TypesenseRAGPluginConfig.embeddingConfig`.
  - Removed `FeatureFlags.embedding` from `ModularPluginConfig`.
  - Removed exports: `generateEmbedding`, `generateEmbeddingWithUsage`,
    `generateEmbeddingsBatchWithUsage`, `EmbeddingProviderConfig`,
    `EmbeddingWithUsage`, `BatchEmbeddingWithUsage`.
  - `RAGSearchConfig` no longer has `autoEmbedCollections`. `RAGChatRequest`
    no longer has `queryEmbedding`. `TypesenseQueryConfig` no longer has
    `queryEmbedding` or `autoEmbedCollections`.
  - `BuildVectorSearchParamsOptions` no longer has `autoEmbed`.
    `buildVectorSearchParams` no longer accepts a precomputed search vector —
    Typesense always embeds the query.
  - `buildMultiCollectionVectorSearchParams` no longer accepts a `searchVector`
    argument — autoEmbed is the only mode.
  - Schema generation: a table without `embedding.autoEmbed` no longer gets
    an `embedding` field at all (was previously optional with `num_dim`).
    Vector search filters out such tables.
  - Removed `@google/generative-ai` and `openai` from dependencies.
  - Added `TypesenseAutoEmbedConfig` and `TypesenseModelConfig` exports for
    typing the per-table `embedding.autoEmbed` config.

  **`@zetesis/mcp-typesense` breaking changes**

  - `McpServerConfig.embeddings` removed. `createMcpServer` no longer needs
    any embedding provider config — the MCP package sends queries as text
    and Typesense embeds them server-side using each chunk collection's
    declared `embed.model_config`.
  - Removed exports: `EmbeddingConfig`.
  - Removed internal `embeddings/openai.ts` module and the `openai` runtime
    dependency.
  - Search builders for `mode: 'semantic'` and `mode: 'hybrid'` now emit
    `vector_query: 'embedding:([], k:N[, alpha:...])'` and force
    `prefix: false` (Typesense rejects prefix search whenever a remote
    embedder participates in `query_by`). Hybrid `query_by` now includes
    the `embedding` field so the autoEmbed flow kicks in.
  - Each chunk collection must declare `embed.from` + `embed.model_config`
    on its Typesense schema (e.g. via `@zetesis/payload-typesense`'s
    `embedding.autoEmbed`). Without it, semantic and hybrid modes fall
    through to a Typesense error; lexical still works unchanged.

  **Migration**

  For any indexed table that produced embeddings under the old API, declare
  `autoEmbed` and drop the existing Typesense collection so it is recreated
  with the new `embed` block. Type the value via `TypesenseAutoEmbedConfig`
  (re-exported from `@zetesis/payload-typesense`) to keep `modelConfig`
  type-safe:

  ```ts
  import type { TypesenseAutoEmbedConfig } from '@zetesis/payload-typesense'

  const autoEmbed: TypesenseAutoEmbedConfig = {
    from: ['chunk_text'],
    modelConfig: {
      modelName: 'openai/text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY!
    }
  }

  // then…
  {
    embedding: {
      fields: ['content'],
      chunking: { strategy: 'markdown' },
      autoEmbed
    }
  }
  ```

  After deploying, drop the affected `*_chunk` collections in Typesense and
  re-sync: existing documents have a client-supplied `embedding` that the new
  schema rejects.

## 0.2.1

### Patch Changes

- [#44](https://github.com/Zetesis-Labs/PayloadAgents/pull/44) [`5ffdff5`](https://github.com/Zetesis-Labs/PayloadAgents/commit/5ffdff5b574026a6a16be52166c1be350c1ad326) Thanks [@Fiser12](https://github.com/Fiser12)! - Allow taxonomy-only auth contexts. The header strategy used to discard the entire context whenever `x-tenant-slug` was missing, even if `x-taxonomy-slugs` was present. Single-tenant deploys (no tenant header) couldn't auto-scope by taxonomy at all. Now `resolveAuth` returns a context whenever at least one of the two headers is present and `tenantSlug` becomes optional in the resolved object. Multi-tenant deploys keep working unchanged because they always send both headers.

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
