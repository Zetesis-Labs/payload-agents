---
"@zetesis/payload-indexer": minor
"@zetesis/payload-typesense": minor
---

Drop client-side embedding path. `autoEmbed` is now the only embedding mode.

The search backend (Typesense) generates every vector — on upsert from the
fields listed in `embedding.autoEmbed.from`, and on search from the `q`
parameter using the model declared in the collection schema. The indexer
never calls an embedding API.

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
