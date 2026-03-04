# RAG Feature

Retrieval Augmented Generation (RAG) for conversational AI with context from Typesense.

## Structure

```
rag/
├── api/                 # API route handlers
│   └── chat/           # Chat endpoint
│       ├── handlers/   # Request handlers
│       ├── validators/ # Request validation
│       └── route.ts    # Main endpoint (247 lines)
├── handlers/           # Core RAG handlers
├── stream-handlers/    # Streaming response handlers
├── utils/              # RAG utilities
├── chat-session-repository.ts  # Session management
├── create-rag-payload-handlers.ts  # Payload endpoint setup
├── query-builder.ts    # RAG query building
├── setup.ts            # RAG initialization
├── stream-handler.ts   # Stream processing
└── types.ts            # RAG type definitions
```

## Key Components

### Chat API (`./api/chat/`)

**route.ts** (247 lines - reduced from 483)
- Main chat endpoint handler
- Orchestrates the RAG flow
- Manages streaming responses

**Handlers:**
- `token-limit-handler.ts` - Token limit checking
- `embedding-handler.ts` - Embedding generation with tracking
- `usage-stats-handler.ts` - Usage statistics and tracking
- `session-handler.ts` - Chat session persistence

**Validators:**
- `request-validator.ts` - Chat request validation

### Core Handlers (`./handlers/`)
- `rag-search-handler.ts` - Executes RAG search
- `chunk-fetch-handler.ts` - Fetches document chunks by ID
- `session-handlers.ts` - Session management (get, save, close)

### Stream Handlers (`./stream-handlers/`)
- `streaming-handler.ts` - Handles streaming LLM responses
- `non-streaming-handler.ts` - Handles non-streaming responses
- `utils.ts` - Shared streaming utilities

### Utilities (`./utils/`)
- `sse-utils.ts` - Server-Sent Events formatting

## RAG Flow

```
User Message
     ↓
Validate Request
     ↓
Check Token Limits
     ↓
Generate Embedding
     ↓
Search Relevant Chunks (Typesense)
     ↓
Build Context from Chunks
     ↓
Send to LLM (with context)
     ↓
Stream Response to Client
     ↓
Track Usage & Save Session
```

## Chat Configuration

```typescript
type ChatEndpointConfig = {
  checkPermissions: (request) => Promise<boolean>;
  typesense: TypesenseConnectionConfig;
  rag: RAGSearchConfig;
  getPayload: () => Promise<Payload>;
  checkTokenLimit?: (userId, tokens) => Promise<LimitCheck>;
  getUserUsageStats?: (userId) => Promise<UsageStats>;
  saveChatSession?: (...) => Promise<void>;
  handleStreamingResponse: (...) => Promise<StreamResult>;
  handleNonStreamingResponse: (...) => Promise<StreamResult>;
  createEmbeddingSpending?: (model, tokens) => SpendingEntry;
  estimateTokensFromText?: (text) => number;
};
```

## Features

### Semantic Search
- Generates embeddings for user queries
- Searches Typesense for semantically similar chunks
- Ranks results by relevance

### Context Building
- Combines relevant chunks into context
- Respects token limits
- Includes source attribution

### Streaming Responses
- Real-time LLM response streaming via SSE
- Progress updates during generation
- Error handling and recovery

### Session Management
- Persists chat history
- Supports multi-turn conversations
- Tracks conversation context

### Usage Tracking
- Monitors token usage
- Tracks costs per request
- Enforces daily limits
- Provides usage statistics

## Event Types (SSE)

```typescript
// Message chunk from LLM
{ type: 'message', data: { content: '...' } }

// Source documents
{ type: 'sources', data: [{ id, title, ... }] }

// Usage statistics
{ type: 'usage', data: { tokens_used, cost_usd, ... } }

// Errors
{ type: 'error', data: { error: '...' } }

// Completion
{ type: 'done', data: {} }
```
