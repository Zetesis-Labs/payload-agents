# Sync Feature

Automatic synchronization of Payload CMS documents to Typesense collections.

## Structure

```
sync/
├── collection-manager.ts    # Collection management
├── document-delete.ts       # Document deletion
├── document-syncer.ts       # Document synchronization (Unified)
└── index.ts                 # Public exports
```

## Sync Strategies

### Unified Document Syncer
**Purpose:** Handles both full document syncing and chunking based on configuration.

**Configuration:**
- If `embedding.chunking` is present -> Chunking Strategy
- If `embedding.chunking` is missing -> Full Document Strategy

### Full Document Mode
**Use Cases:**
- Small documents
- Structured data
- When full-text search is sufficient

**Process:**
1. Extract document fields
2. Generate embedding (optional)
3. Map to Typesense schema
4. Upsert to Typesense

### Chunking Mode
**Use Cases:**
- Large documents (articles, books, documentation)
- When semantic search is needed
- Better context retrieval for RAG

**Process:**
1. Extract document content
2. Split into chunks (markdown-based or custom)
3. Generate embeddings for each chunk
4. Create parent document + chunk documents
5. Upsert all to Typesense

**Chunk Structure:**
```typescript
{
  id: "doc123_chunk_0",
  parent_id: "doc123",
  chunk_index: 0,
  content: "...",
  embedding: [0.1, 0.2, ...],
  metadata: { title, slug, ... }
}
```

## Sync Flow

```
Payload Document Update
          ↓
    Sync Trigger (afterChange hook)
          ↓
    DocumentSyncer
          ↓
    Check Config
          ↓
    ┌─────┴─────┐
    ↓           ↓
Full Doc    Chunking
Logic       Logic
    ↓           ↓
Generate    Split into
Embedding   Chunks
    ↓           ↓
Map to      Generate
Schema      Embeddings
    ↓           ↓
Upsert to   Upsert All
Typesense   to Typesense
```

## Collection Management

**collection-manager.ts**
- Creates collections if they don't exist
- Manages collection schemas
- Handles schema updates
- Validates collection configuration

**Functions:**
- `ensureCollectionExists()` - Creates collection if missing
- `updateCollectionSchema()` - Updates existing collection
- `deleteCollection()` - Removes collection

## Document Operations

### Sync (`document-syncer.ts`)
**Triggers:** Payload `afterChange` hook

**Operations:**
- `create` - New document → Upsert to Typesense
- `update` - Updated document → Upsert to Typesense

**Error Handling:**
- Logs errors without breaking Payload operations
- Retries on transient failures
- Validates before syncing

### Delete (`document-delete.ts`)
**Triggers:** Payload `afterDelete` hook

**Operations:**
- Removes document from Typesense
- Removes all chunks (if using chunking strategy)
- Cleans up parent-child relationships

## Configuration

```typescript
{
  collections: {
    articles: [
      {
        enabled: true,
        collectionName: 'articles_full',
        strategy: 'fullDocument',
        searchFields: ['title', 'content'],
        generateEmbedding: true
      },
      {
        enabled: true,
        collectionName: 'articles_chunks',
        strategy: 'chunking',
        chunkSize: 1000,
        chunkOverlap: 200,
        generateEmbedding: true
      }
    ]
  }
}
```

## Auto-Sync Hooks

Automatically applied to Payload collections:

```typescript
{
  hooks: {
    afterChange: [
      async ({ doc, operation }) => {
        await syncDocumentToTypesense(
          client, collection, doc, operation, config, embeddingConfig
        );
      }
    ],
    afterDelete: [
      async ({ doc }) => {
        await deleteDocumentFromTypesense(
          client, collection, doc.id, config
        );
      }
    ]
  }
}
```
