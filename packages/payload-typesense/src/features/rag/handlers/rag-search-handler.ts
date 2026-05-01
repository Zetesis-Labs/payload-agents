/**
 * RAG search handler
 *
 * Handles the execution of RAG conversational search against Typesense
 */

import type { TypesenseConnectionConfig } from '../../../index'
import type { ChunkSource } from '../../../shared/index'
import { buildConversationalUrl, buildMultiSearchRequestBody } from '../query-builder'

/**
 * Configuration for RAG search
 */
export type RAGSearchConfig = {
  /** Collections to search in */
  searchCollections: string[]
  /**
   * Subset of `searchCollections` whose `embedding` field is auto-embedded
   * by Typesense (declared with `embed.model_config` in the schema). For
   * those, the handler does NOT need a precomputed `queryEmbedding`.
   */
  autoEmbedCollections?: string[]
  /** Conversation model ID */
  modelId: string
  /** Number of results to retrieve */
  kResults?: number
  /** Advanced search configuration */
  advancedConfig?: {
    typoTokensThreshold?: number
    numTypos?: number
    prefix?: boolean
    dropTokensThreshold?: number
  }
  /** Taxonomy slugs to filter RAG content */
  taxonomySlugs?: string[]
  /** When true, block search if no taxonomySlugs are assigned */
  requireTaxonomies?: boolean
}

/**
 * Request parameters for RAG chat
 */
export type RAGChatRequest = {
  /** User's message */
  userMessage: string
  /**
   * Pre-computed embedding for `userMessage`. Optional when every collection
   * in the search is listed in `RAGSearchConfig.autoEmbedCollections`.
   */
  queryEmbedding?: number[]
  /** Optional chat/conversation ID for follow-up messages */
  chatId?: string
  /** Optional selected document IDs to filter search */
  selectedDocuments?: string[]
}

/**
 * Result of a RAG search operation
 */
export type RAGSearchResult = {
  /** Full assistant message (for non-streaming responses) */
  fullAssistantMessage?: string
  /** Conversation ID from Typesense */
  conversationId?: string
  /** Sources/chunks used in the response */
  sources: ChunkSource[]
  /** Raw response from Typesense */
  response: Response
  /** Whether the response is streaming */
  isStreaming: boolean
}

/**
 * Execute a RAG conversational search
 *
 * This function handles the complete flow of executing a RAG search against Typesense:
 * 1. Builds the conversational URL
 * 2. Builds the multi-search request body
 * 3. Executes the request
 * 4. Returns the response with metadata
 *
 * @param typesenseConfig - Typesense connection configuration
 * @param searchConfig - RAG search configuration
 * @param request - Chat request parameters
 * @returns Promise with search results
 */
export async function executeRAGSearch(
  typesenseConfig: TypesenseConnectionConfig,
  searchConfig: RAGSearchConfig,
  request: RAGChatRequest
): Promise<RAGSearchResult> {
  // Build the Typesense conversational search URL
  const typesenseUrl = buildConversationalUrl(request, searchConfig.modelId, typesenseConfig)

  // Build the multi-search request body
  const requestBody = buildMultiSearchRequestBody({
    userMessage: request.userMessage,
    ...(request.queryEmbedding !== undefined && { queryEmbedding: request.queryEmbedding }),
    ...(searchConfig.autoEmbedCollections !== undefined && {
      autoEmbedCollections: searchConfig.autoEmbedCollections
    }),
    selectedDocuments: request.selectedDocuments,
    chatId: request.chatId,
    searchCollections: searchConfig.searchCollections,
    kResults: searchConfig.kResults || 10,
    advancedConfig: searchConfig.advancedConfig,
    taxonomySlugs: searchConfig.taxonomySlugs,
    requireTaxonomies: searchConfig.requireTaxonomies
  })

  // Execute the search
  const response = await fetch(typesenseUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TYPESENSE-API-KEY': typesenseConfig.apiKey
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()

    // Detect expired conversation error
    if (errorText.includes('conversation_id') && errorText.includes('invalid')) {
      const error = new Error('EXPIRED_CONVERSATION', { cause: errorText })
      throw error
    }

    throw new Error(`Typesense search failed: ${errorText}`)
  }

  // Check if response is streaming
  const contentType = response.headers.get('content-type')
  const isStreaming = contentType?.includes('text/event-stream') || false

  return {
    response,
    isStreaming,
    sources: [] // Will be populated by stream/response handlers
  }
}
