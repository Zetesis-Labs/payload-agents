/**
 * Payload CMS adapters for RAG endpoints
 *
 * Only the chunks endpoint remains — chat and sessions are handled
 * by @zetesis/payload-agents-core via Agno.
 */

import type { PayloadHandler } from 'payload'
import type { TypesenseRAGPluginConfig } from '../../plugin/rag-types'
import { createChunksGETHandler } from './endpoints/chunks/[id]/route'

/**
 * Creates Payload handlers for RAG endpoints
 */
export function createRAGPayloadHandlers(config: TypesenseRAGPluginConfig): Array<{
  path: string
  method: 'connect' | 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put'
  handler: PayloadHandler
}> {
  const endpoints: Array<{
    path: string
    method: 'connect' | 'delete' | 'get' | 'head' | 'options' | 'patch' | 'post' | 'put'
    handler: PayloadHandler
  }> = []

  if (!config.callbacks) {
    return endpoints
  }

  endpoints.push({
    path: '/chat/chunks/:id',
    method: 'get' as const,
    handler: createChunksGETHandler({
      typesense: config.typesense,
      checkPermissions: config.callbacks.checkPermissions,
      allowedCollections: config.search?.defaults?.tables || []
    })
  })

  return endpoints
}
