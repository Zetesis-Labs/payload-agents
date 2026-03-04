# Payload Typesense - Source Code Architecture

This directory contains the source code for the Payload Typesense plugin, organized using a **feature-based architecture** for better maintainability and scalability.

## Directory Structure

```
src/
├── core/              # Core utilities and infrastructure
├── features/          # Feature modules (search, RAG, sync, embedding)
├── shared/            # Shared resources (cache, hooks, schema, types)
├── plugin/            # Main plugin entry point
└── index.ts           # Public API exports
```

## Architecture Overview

### Core (`./core/`)
Fundamental utilities that provide infrastructure for the entire application:
- **client/** - Typesense client configuration
- **config/** - Constants and configuration validation
- **logging/** - Structured logging
- **errors/** - Error class hierarchy

### Features (`./features/`)
Independent feature modules with clear boundaries:
- **search/** - Search functionality (vector + traditional)
- **rag/** - RAG (Retrieval Augmented Generation)
- **sync/** - Document synchronization with Typesense
- **embedding/** - Embeddings generation and text chunking

### Shared (`./shared/`)
Resources shared across multiple features:
- **cache/** - Caching utilities
- **hooks/** - Payload CMS hooks
- **schema/** - Schema mapping and collection schemas
- **types/** - TypeScript type definitions

## Design Principles

1. **Feature-based Organization**: Code is organized by feature/domain rather than technical layer
2. **High Cohesion**: Related code is kept together within modules
3. **Low Coupling**: Features have minimal dependencies on each other
4. **Single Responsibility**: Each module has one clear purpose
5. **Explicit Dependencies**: All imports are explicit and traceable

## Module Dependencies

```
┌─────────┐
│  Core   │ ◄─── Foundation layer (no dependencies)
└─────────┘
     ▲
     │
┌─────────┐
│ Shared  │ ◄─── May use Core
└─────────┘
     ▲
     │
┌─────────┐
│Features │ ◄─── May use Core + Shared
└─────────┘
     ▲
     │
┌─────────┐
│ Plugin  │ ◄─── Orchestrates everything
└─────────┘
```

## Getting Started

Each module has its own README with detailed documentation:
- [Core Utilities](./core/README.md)
- [Search Feature](./features/search/README.md)
- [RAG Feature](./features/rag/README.md)
- [Sync Feature](./features/sync/README.md)
- [Embedding Feature](./features/embedding/README.md)
- [Shared Resources](./shared/README.md)

## Public API

All public exports are defined in `./index.ts`. Internal modules should not be imported directly by external consumers.
