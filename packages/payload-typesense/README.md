# @zetesis/payload-typesense

A powerful, production-ready search plugin that integrates [Typesense](https://typesense.org/) with [Payload CMS](https://payloadcms.com/). This plugin provides lightning-fast, typo-tolerant search capabilities with real-time synchronization, and a comprehensive RAG (Retrieval Augmented Generation) system for building AI-powered conversational agents.

## Features

*   **Real-time Sync**: Automatically syncs your Payload collections to Typesense.
*   **Flexible Indexing**: Map a single Payload collection to multiple Typesense indices (tables) with different configurations.
*   **Advanced Search**:
    *   **Semantic Search**: Vector-based search using embeddings.
    *   **Keyword Search**: Traditional text matching with typo tolerance.
    *   **Hybrid Search**: Combines vector and keyword search for optimal relevance.
*   **RAG & AI Agents**:
    *   Built-in support for conversational AI agents.
    *   Integrates with OpenAI and Gemini.
    *   Manages chat sessions and history.
    *   Streaming responses (SSE).
*   **Optimized Performance**: Configurable HNSW parameters for vector search and batch processing for sync.

## Installation

```bash
pnpm add @zetesis/payload-typesense
```

## Configuration

The plugin is configured in your `payload.config.ts`.

### Basic Setup

```typescript
import { buildConfig } from 'payload/config';
import { typesenseSearch } from '@zetesis/payload-typesense';

export default buildConfig({
  // ...
  plugins: [
    typesenseSearch({
      typesense: {
        apiKey: process.env.TYPESENSE_API_KEY,
        nodes: [
          {
            host: process.env.TYPESENSE_HOST,
            port: 443,
            protocol: 'https',
          },
        ],
      },
      features: {
        sync: { enabled: true },
        search: { enabled: true },
        embedding: {
          type: 'openai',
          apiKey: process.env.OPENAI_API_KEY,
          model: 'text-embedding-3-small',
        },
      },
      collections: {
        posts: [
          {
            enabled: true,
            tableSuffix: 'v1',
            searchFields: ['title', 'content'],
            chunkingStrategy: { type: 'markdown' },
          },
        ],
      },
    }),
  ],
});
```

### Sync Configuration

You can define how each collection is synced to Typesense. The `collections` object maps collection slugs to an array of `CollectionTableConfig`.

```typescript
collections: {
  posts: [
    {
      enabled: true,
      // Optional suffix for the Typesense collection name
      // Result: "posts_summary"
      tableSuffix: 'summary',
      // Fields to include in the Typesense document
      searchFields: ['title', 'excerpt'],
      // Chunking strategy for long text
      chunkingStrategy: { type: 'simple', chunkSize: 500 },
    },
    {
      enabled: true,
      // Explicitly naming the table overrides the default naming convention
      // Result: "my_custom_posts_index"
      tableName: 'my_custom_posts_index',
      searchFields: ['title', 'content'],
      chunkingStrategy: { type: 'markdown' },
    }
  ]
}
```

### Embedding strategies

You can pick one of three embedding modes per table:

1. **Global provider** (default) — every table uses `features.embedding`. The
   indexer calls OpenAI/Gemini for every chunk and again for every search query.
2. **Per-table provider** — set `embedding.provider` on a specific table to
   override the global one. Useful for mixing models (e.g. OpenAI Large on
   one table, Gemini on another) without writing a second plugin instance.
3. **Auto-embed (Typesense generates)** — set `embedding.autoEmbed` and
   Typesense embeds documents on every upsert and queries on every search,
   using the model declared in the schema. The indexer never calls an
   embedding API and search shaves one round-trip per query.

```typescript
collections: {
  posts: [
    {
      enabled: true,
      tableName: 'posts_chunk',
      fields: [...],
      embedding: {
        fields: ['title', 'content'],
        chunking: { strategy: 'markdown' },
        // Auto-embed: Typesense uses ts/multilingual-e5-large to embed
        // both `chunk_text` on upsert and the user query on search.
        autoEmbed: {
          from: ['chunk_text'],
          modelConfig: {
            modelName: 'ts/multilingual-e5-large',
            indexingPrefix: 'passage:',
            queryPrefix: 'query:',
          },
        },
      },
    },
  ],
  books: [
    {
      enabled: true,
      tableName: 'books_chunk',
      fields: [...],
      embedding: {
        fields: ['title', 'content'],
        chunking: { strategy: 'markdown' },
        // Per-table provider overrides the plugin-level `features.embedding`.
        provider: {
          type: 'openai',
          model: 'text-embedding-3-large',
          dimensions: 3072,
          apiKey: process.env.OPENAI_API_KEY!,
        },
      },
    },
  ],
}
```

`provider` and `autoEmbed` are mutually exclusive within a single table. When
both are set the plugin uses `autoEmbed` and logs a warning.

### RAG & Agents Configuration

Enable RAG to build chat interfaces on top of your data.

```typescript
features: {
  rag: {
    enabled: true,
    agents: [
      {
        slug: 'support-bot',
        name: 'Support Assistant',
        systemPrompt: 'You are a helpful support assistant.',
        llmModel: 'gpt-4o-mini',
        // Collections this agent can access
        searchCollections: ['posts_full_text'],
      }
    ]
  }
}
```

## Usage

### Search API

The plugin exposes endpoints for searching your data.

**Endpoint:** `/api/typesense/search`

```typescript
// Example using fetch
const response = await fetch('/api/typesense/search', {
  method: 'POST',
  body: JSON.stringify({
    query: 'how to install',
    collections: ['posts_full_text'],
  })
});
```

### RAG Chat API

**Endpoint:** `/api/typesense/rag/chat`

This endpoint supports Server-Sent Events (SSE) for streaming AI responses.

```typescript
// Example client-side code (simplified)
const eventSource = new EventSource('/api/typesense/rag/chat?message=hello');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'token') {
    console.log(data.data); // Streamed text
  }
};
```

## Architecture

### Key Classes

| Class / Function | File | Role |
|-----------------|------|------|
| `TypesenseAdapter` | `src/adapter/typesense-adapter.ts` | Implements `IndexerAdapter` for Typesense operations |
| `SchemaManager` | `src/adapter/` | Creates and manages Typesense collection schemas |
| `SearchService` | `src/features/search/` | Orchestrates traditional and vector search |
| `TargetCollectionResolver` | `src/features/search/` | Resolves which Typesense collections to query |
| `SearchConfigMapper` | `src/features/search/` | Maps plugin config to Typesense search parameters |
| `createTypesenseRAGPlugin` | `src/plugin/create-rag-plugin.ts` | RAG plugin factory, registers chat and session endpoints |

### Search Pipeline

```
createSearchHandler (entry point)
  -> validateSearchRequest -> getValidationErrors / validateSearchParams
  -> TargetCollectionResolver (determines target collections)
  -> SearchService
    |-- buildTraditionalSearchParams -> searchTraditionalCollection
    |     -> processSingleCollectionTraditionalResults
    |-- buildVectorSearchParams -> searchVectorCollection
    |     -> processVectorResults
  -> combineResults (merge + re-rank)
```

### RAG Pipeline

```
createTypesenseRAGPlugin
  -> createRAGPayloadHandlers
    -> resolveAgents (loads tenant agents)
    -> checkTokenLimitsIfNeeded (subscription-based usage control)
    -> executeRAGSearch -> buildConversationalUrl
    -> handleStreamEvent -> sendSSEEvent -> formatSSEEvent
    -> saveChatSession (persistence)
```

Session management endpoints: `createSessionGETHandler`, `createSessionPATCHHandler`, `createSessionDELETEHandler`.

## Roadmap

We are actively working to improve the modularity and flexibility of the plugin.

### 1. Modular Embedding Strategies — **Done**
*   ~~Move `embedding` config to `CollectionTableConfig`.~~ — `embedding.provider` per table.
*   ~~Support "Table X" -> Gemini, "Table Y" -> OpenAI Large.~~
*   ~~Auto-embed via Typesense `embed.model_config` (no client-side embedding round-trip).~~ — see `embedding.autoEmbed`.

### 2. Expanded Provider Support
*   **Embeddings:** Add support for Cohere, HuggingFace, and local models (via Ollama).
*   **LLMs:** Add support for Anthropic (Claude), Mistral, and local LLMs.

### 4. Admin UI
*   ~~Dashboard within Payload Admin to view Typesense collection status.~~ **Done** -- `_syncStatus` virtual field via `payload-indexer`
*   ~~Buttons to manually trigger re-sync or re-indexing.~~ **Done** -- "Sync Now" button in document sidebar
*   Visual management of RAG agents.

### 5. Advanced Sync Controls
*   **Soft Deletes:** Option to mark documents as deleted in Typesense instead of removing them.
*   ~~**Conditional Sync:** specialized `syncCondition` function to control which documents are synced based on their content (e.g., only sync `published` posts).~~ **Done** -- `enabled` flag per `CollectionTableConfig`
