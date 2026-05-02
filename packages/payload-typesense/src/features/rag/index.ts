/**
 * RAG utilities for Typesense — search + chunk retrieval.
 *
 * Chat and session management have moved to @zetesis/payload-agents-core.
 */

export type { TypesenseConnectionConfig } from '../../shared/types/plugin-types'
// API Types
export type { ApiContext, AuthenticateMethod } from './endpoints/types'
// Handlers
export type {
  ChunkFetchConfig,
  ChunkFetchResult,
  RAGChatRequest,
  RAGSearchConfig,
  RAGSearchResult
} from './handlers/index'
export { executeRAGSearch, fetchChunkById } from './handlers/index'

// Query Builder
export {
  buildConversationalUrl,
  buildHybridSearchParams,
  buildMultiSearchRequestBody,
  buildMultiSearchRequests
} from './query-builder'

// SSE Utilities
export { formatSSEEvent, sendSSEEvent } from './utils/sse-utils'
