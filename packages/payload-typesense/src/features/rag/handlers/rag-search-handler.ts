/**
 * RAG search handler
 *
 * Handles the execution of RAG conversational search against Typesense.
 * Every target collection is expected to be auto-embedded — Typesense
 * generates query and document vectors server-side using the schema's
 * declared `embed.model_config`.
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
  /** Optional chat/conversation ID for follow-up messages */
  chatId?: string
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
 */
export async function executeRAGSearch(
  typesenseConfig: TypesenseConnectionConfig,
  searchConfig: RAGSearchConfig,
  request: RAGChatRequest
): Promise<RAGSearchResult> {
  const typesenseUrl = buildConversationalUrl(request, searchConfig.modelId, typesenseConfig)

  const requestBody = buildMultiSearchRequestBody({
    userMessage: request.userMessage,
    chatId: request.chatId,
    searchCollections: searchConfig.searchCollections,
    kResults: searchConfig.kResults || 10,
    advancedConfig: searchConfig.advancedConfig,
    taxonomySlugs: searchConfig.taxonomySlugs,
    requireTaxonomies: searchConfig.requireTaxonomies
  })

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

    if (errorText.includes('conversation_id') && errorText.includes('invalid')) {
      const error = new Error('EXPIRED_CONVERSATION', { cause: errorText })
      throw error
    }

    throw new Error(`Typesense search failed: ${errorText}`)
  }

  const contentType = response.headers.get('content-type')
  const isStreaming = contentType?.includes('text/event-stream') || false

  return {
    response,
    isStreaming,
    sources: []
  }
}
