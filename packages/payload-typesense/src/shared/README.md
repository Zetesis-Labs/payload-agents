# Shared Resources

Common utilities and resources used across multiple features.

## Structure

```
shared/
├── cache/              # Caching utilities
├── hooks/              # Payload CMS hooks
├── schema/             # Schema mapping
└── types/              # TypeScript type definitions
```

## Modules

### Cache (`./cache/`)

**Purpose:** Result caching to improve performance

**cache.ts**
- Search result caching
- TTL-based expiration
- Collection-aware caching
- Memory-efficient

**Usage:**
```typescript
import { searchCache } from './shared/cache/cache.js';

// Set cache
searchCache.set(query, results, collectionName, options);

// Get cache
const cached = searchCache.get(query, collectionName);

// Clear cache
searchCache.clear(collectionName);
```

**Features:**
- Configurable TTL (time-to-live)
- Automatic expiration
- Collection-specific invalidation
- Memory management

### Hooks (`./hooks/`)

**Purpose:** Payload CMS lifecycle hooks

**hooks.ts**
- Document sync hooks
- Auto-sync on document changes
- Delete hooks for cleanup

**Hook Types:**
```typescript
- afterChange: Syncs document to Typesense
- afterDelete: Removes document from Typesense
```

### Schema (`./schema/`)

**Purpose:** Typesense schema management and document mapping

**schema-mapper.ts**
- Maps Payload documents to Typesense format
- Handles field transformations
- Manages nested objects
- Array field handling

**collection-schemas.ts**
- Defines Typesense collection schemas
- Embedding field configuration
- Chunk collection schemas
- Full document schemas

**Functions:**
```typescript
- getEmbeddingField(dimensions?): Field definition
- getChunkCollectionSchema(name, dimensions?): Schema
- getFullDocumentCollectionSchema(name, dimensions?): Schema
- mapPayloadToTypesense(doc, config): TypesenseDocument
```

### Types (`./types/`)

**Purpose:** TypeScript type definitions shared across features

**types.ts**
- Core data types
- Search types
- Collection types
- Document types
- Response types

**plugin-types.ts**
- Plugin configuration types
- Collection table configuration
- Embedding configuration
- RAG configuration

**Key Types:**
```typescript
// Configuration
- TypesenseSearchConfig
- CollectionTableConfig
- RAGConfig

// Data
- TypesenseDocument
- SearchResult
- SearchResponse
- ChunkSource

// Cache
- CacheEntry
- CacheOptions
```

## Design Principles

1. **No Feature Dependencies**: Shared modules don't depend on features
2. **Reusability**: Code used by 2+ features belongs here
3. **Single Source of Truth**: Types defined once, used everywhere
4. **Explicit Exports**: Clear public API through index.ts files

## Usage Guidelines

### When to Add to Shared

✅ **DO** add to shared when:
- Utility is used by 2+ features
- Type is shared across features
- Hook affects multiple features
- Schema is used in multiple contexts

❌ **DON'T** add to shared when:
- Used by only one feature
- Feature-specific logic
- Tightly coupled to a feature

### Import Patterns

```typescript
// ✅ Good - Import from shared
import { TypesenseDocument } from './shared/types/types.js';
import { searchCache } from './shared/cache/cache.js';

// ❌ Bad - Don't import features from shared
// shared modules should not import from features
```

## Testing

When testing shared utilities:
- Test in isolation
- Mock external dependencies
- Test edge cases
- Verify type safety
