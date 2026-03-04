# Search Feature

Full-text and vector search functionality using Typesense.

## Structure

```
search/
├── handlers/         # Search request handlers
│   ├── executors/   # Search execution strategies
│   ├── utils/       # Search utilities
│   └── validators/  # Request validation
├── results/         # Result processing
├── traditional/     # Traditional full-text search
├── utils/           # General utilities
├── vector/          # Vector search
├── constants.ts     # Search-specific constants
├── search-endpoints.ts  # Payload endpoint setup
└── types.ts         # TypeScript types
```

## Key Components

### Handlers (`./handlers/`)

**search-handler.ts** (178 lines)
- Main search orchestrator
- Coordinates between vector and traditional search
- Handles multi-collection searches
- Integrates caching

**Validators:**
- `search-request-validator.ts` - Validates and parses search requests

**Executors:**
- `traditional-search-executor.ts` - Executes traditional search with caching

**Utils:**
- `document-transformer.ts` - Transforms search results to simplified format
- `result-sorter.ts` - Sorts search results
- `result-combiner.ts` - Combines multi-search results
- `vector-search-builder.ts` - Builds vector search parameters

### Vector Search (`./vector/`)
- `generate-vector.ts` - Generates query embedding vectors
- `build-params.ts` - Builds vector search parameters
- `build-multi-collection-params.ts` - Multi-collection vector search

### Traditional Search (`./traditional/`)
- `build-params.ts` - Builds traditional search parameters
- `search-collection.ts` - Executes traditional search

### Results Processing (`./results/`)
- `process-vector-results.ts` - Processes vector search results
- `process-traditional-results.ts` - Processes traditional search results

## Search Flow

```
Request → Validator → Search Handler
                           ↓
                    ┌──────┴──────┐
                    ↓             ↓
              Vector Search   Traditional Search
                    ↓             ↓
              Process Results
                    ↓
              Combine & Sort
                    ↓
              Transform & Return
```

## Search Types

### Vector Search
Semantic search using embeddings:
```typescript
{
  q: "machine learning concepts",
  searchType: "vector",
  collection: "articles"
}
```

### Traditional Search
Full-text keyword search:
```typescript
{
  q: "machine learning",
  searchType: "traditional",
  collection: "articles"
}
```

### Hybrid Search
Combines vector and traditional search with alpha parameter:
```typescript
{
  q: "machine learning",
  searchType: "hybrid",
  alpha: 0.7,  // 70% vector, 30% traditional
  collection: "articles"
}
```

## Caching

Search results are cached using the search cache:
- Cache key: query + collection + parameters
- TTL: Configurable (default from constants)
- Automatic invalidation on document updates
