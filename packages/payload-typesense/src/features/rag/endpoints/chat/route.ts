import type { CollectionSlug, Payload, PayloadRequest } from 'payload'
import { logger } from '../../../../core/logging/logger'
import type {
  ChunkSource,
  EmbeddingProviderConfig,
  RAGFeatureConfig,
  SpendingEntry,
  SSEEvent
} from '../../../../shared/types/plugin-types'
import { markChatSessionAsExpired } from '../../chat-session-repository'
import { executeRAGSearch, type RAGSearchConfig, sendSSEEvent, type TypesenseConnectionConfig } from '../../index'
import { generateEmbeddingWithTracking } from './handlers/embedding-handler'
import { saveChatSessionIfNeeded } from './handlers/session-handler'
import { checkTokenLimitsIfNeeded } from './handlers/token-limit-handler'
import { calculateTotalUsage, sendUsageStatsIfNeeded } from './handlers/usage-stats-handler'
import { withUserLock } from './handlers/user-lock'
import { validateChatRequest } from './validators/index'

/**
 * Configuration for chat endpoint
 */
export type ChatEndpointConfig = {
  /** Collection name for chat sessions */
  collectionName: CollectionSlug
  /** Check permissions function */
  checkPermissions: (request: PayloadRequest) => Promise<boolean>
  /** Typesense connection config */
  typesense: TypesenseConnectionConfig
  /** RAG search configuration */
  rag: RAGFeatureConfig
  /** Get Payload instance */
  getPayload: () => Promise<Payload>
  /** Embedding configuration */
  embeddingConfig?: EmbeddingProviderConfig
  /** Check token limit function */
  checkTokenLimit?: (
    payload: Payload,
    userId: string | number,
    tokens: number
  ) => Promise<{
    allowed: boolean
    limit: number
    used: number
    remaining: number
    reset_at?: string
  }>
  /** Get user usage stats function */
  getUserUsageStats?: (
    payload: Payload,
    userId: string | number
  ) => Promise<{
    limit: number
    used: number
    remaining: number
    reset_at?: string
  }>
  /** Save chat session function */
  saveChatSession?: (
    payload: Payload,
    userId: string | number,
    conversationId: string,
    userMessage: string,
    assistantMessage: string,
    sources: ChunkSource[],
    spendingEntries: SpendingEntry[],
    collectionName: CollectionSlug
  ) => Promise<void>
  /** Handle streaming response function */
  handleStreamingResponse: (
    response: Response,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    documentTypeResolver?: (collectionName: string) => string
  ) => Promise<{
    fullAssistantMessage: string
    conversationId: string | null
    sources: ChunkSource[]
    llmSpending: SpendingEntry
  }>
  /** Handle non-streaming response function */
  handleNonStreamingResponse: (
    data: Record<string, unknown>,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    documentTypeResolver?: (collectionName: string) => string
  ) => Promise<{
    fullAssistantMessage: string
    conversationId: string | null
    sources: ChunkSource[]
    llmSpending: SpendingEntry
  }>
  /** Resolve document type from Typesense collection name */
  documentTypeResolver?: (collectionName: string) => string
  /** Create embedding spending function */
  createEmbeddingSpending?: (model: string, tokens: number) => SpendingEntry
  /** Estimate tokens from text function */
  estimateTokensFromText?: (text: string) => number
  /**
   * Timeout in milliseconds for the SSE stream.
   * If the LLM upstream doesn't complete within this time, the stream
   * is closed with an error event.
   * @default 120_000 (2 minutes)
   */
  streamTimeoutMs?: number
}

/**
 * Handle an expired conversation error inside the stream
 */
async function handleExpiredConversationError(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: Payload,
  userId: string | number,
  chatId: string | undefined,
  collectionName: CollectionSlug
): Promise<void> {
  logger.warn('Expired conversation detected', { userId, chatId })

  if (chatId) {
    await markChatSessionAsExpired(payload, chatId, collectionName)
  }

  sendSSEEvent(controller, encoder, {
    type: 'error',
    data: {
      error: 'EXPIRED_CONVERSATION',
      message: 'Esta conversación ha expirado (>24 horas de inactividad). Por favor, inicia una nueva conversación.',
      chatId
    }
  })
  controller.close()
}

/**
 * Handle a generic stream error
 */
function handleGenericStreamError(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  error: unknown,
  userId: string | number,
  chatId: string | undefined
): void {
  logger.error('Fatal error in chat stream', error as Error, { userId, chatId })
  sendSSEEvent(controller, encoder, {
    type: 'error',
    data: {
      error: error instanceof Error ? error.message : 'Error desconocido'
    }
  })
  // Extra newline to force flush the SSE error event before closing
  controller.enqueue(encoder.encode('\n'))
  controller.close()
}

/**
 * Create a parameterizable POST handler for chat endpoint
 */
export function createChatPOSTHandler(config: ChatEndpointConfig) {
  return async function POST(request: PayloadRequest) {
    try {
      // Validate request
      const validated = await validateChatRequest(request, config)
      if (!validated.success) {
        return validated.error
      }

      const { userId, userEmail, payload, userMessage, body } = validated

      // Build search config from RAG config
      const searchConfig: RAGSearchConfig = {
        advancedConfig: config.rag.advanced
      }

      // Check token limits if configured.
      // Serialized per-user to prevent TOCTOU race where concurrent requests
      // both pass the check before either consumes tokens.
      // Note: for multi-instance deployments, checkTokenLimit should use an
      // atomic database operation (UPDATE...RETURNING or Redis INCR).
      const tokenLimitError = await withUserLock(userId, () =>
        checkTokenLimitsIfNeeded(config, payload, userId, userEmail, userMessage)
      )
      if (tokenLimitError) {
        return tokenLimitError
      }

      logger.info('Processing chat message', {
        userId,
        chatId: body.chatId || 'new',
        isFollowUp: !!body.chatId,
        hasSelectedDocuments: !!body.selectedDocuments,
        messageLength: userMessage.length
      })

      // Create a streaming response
      const encoder = new TextEncoder()
      const timeoutMs = config.streamTimeoutMs ?? 120_000
      const stream = new ReadableStream({
        async start(controller) {
          const spendingEntries: SpendingEntry[] = []

          const streamTimeout = setTimeout(() => {
            logger.error('Stream timeout exceeded', new Error('Stream timeout'), {
              userId,
              chatId: body.chatId,
              timeoutMs
            })
            sendSSEEvent(controller, encoder, {
              type: 'error',
              data: { error: 'La respuesta tardó demasiado. Por favor, inténtalo de nuevo.' }
            })
            controller.enqueue(encoder.encode('\n'))
            controller.close()
          }, timeoutMs)

          try {
            const sendEvent = (event: SSEEvent) => sendSSEEvent(controller, encoder, event)

            // Generate embedding with tracking
            const queryEmbedding = await generateEmbeddingWithTracking(userMessage, config, spendingEntries)

            // Execute RAG search
            const searchResult = await executeRAGSearch(config.typesense, searchConfig, {
              userMessage,
              queryEmbedding,
              chatId: body.chatId,
              selectedDocuments: body.selectedDocuments
            })

            // Handle streaming or non-streaming response
            const streamResult =
              searchResult.isStreaming && searchResult.response.body
                ? await config.handleStreamingResponse(
                    searchResult.response,
                    controller,
                    encoder,
                    config.documentTypeResolver
                  )
                : await config.handleNonStreamingResponse(
                    await searchResult.response.json(),
                    controller,
                    encoder,
                    config.documentTypeResolver
                  )

            // Extract results
            spendingEntries.push(streamResult.llmSpending)

            // Calculate total usage
            const { totalTokens: totalTokensUsed, totalCostUSD } = calculateTotalUsage(spendingEntries)

            // Send usage stats
            await sendUsageStatsIfNeeded(config, payload, userId, totalTokensUsed, totalCostUSD, sendEvent)

            // Save session
            await saveChatSessionIfNeeded(
              config,
              payload,
              userId,
              streamResult.conversationId,
              userMessage,
              streamResult.fullAssistantMessage,
              streamResult.sources,
              spendingEntries
            )

            logger.info('Chat request completed successfully', {
              userId,
              conversationId: streamResult.conversationId,
              totalTokens: totalTokensUsed
            })
            clearTimeout(streamTimeout)
            controller.close()
          } catch (error) {
            clearTimeout(streamTimeout)
            if (error instanceof Error && error.message === 'EXPIRED_CONVERSATION') {
              await handleExpiredConversationError(
                controller,
                encoder,
                payload,
                userId,
                body.chatId,
                config.collectionName
              )
              return
            }
            handleGenericStreamError(controller, encoder, error, userId, body.chatId)
          }
        }
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        }
      })
    } catch (error) {
      logger.error('Error in chat API endpoint', error as Error, {
        userId: request.user?.id
      })

      return new Response(
        JSON.stringify({
          error: 'Error al procesar tu mensaje. Por favor, inténtalo de nuevo.',
          details: error instanceof Error ? error.message : 'Error desconocido'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
  }
}

/**
 * Default export for Next.js App Router
 * Users should call createChatPOSTHandler with their config
 */
export { createChatPOSTHandler as POST }
