/**
 * Composable Typesense RAG plugin factory for Payload CMS
 *
 * This plugin handles all Typesense-specific functionality:
 * - Search endpoints
 * - RAG endpoints
 * - Schema synchronization
 *
 * It's designed to be used together with createIndexerPlugin from @zetesis/payload-indexer.
 */

import { Logger } from '@zetesis/payload-indexer'
import type { Config } from 'payload'
import { createTypesenseClient } from '../core/client/typesense-client'
import { createRAGPayloadHandlers } from '../features/rag/endpoints'
import { createSearchEndpoints } from '../features/search/endpoints'
import { SchemaManager } from '../features/sync/services/schema-manager'
import type { TypesenseRAGPluginConfig } from './rag-types'

/**
 * Creates a composable Typesense RAG plugin for Payload CMS
 *
 * This plugin handles all Typesense-specific features:
 * - Search endpoints (semantic, hybrid, keyword)
 * - RAG endpoints (chat, session management)
 * - Schema synchronization
 *
 * @param config - Typesense RAG plugin configuration
 * @returns Payload config modifier function
 */
export function createTypesenseRAGPlugin(config: TypesenseRAGPluginConfig) {
  const logger = new Logger({ enabled: true, prefix: '[payload-typesense]' })

  return (payloadConfig: Config): Config => {
    // Create Typesense client
    const typesenseClient = createTypesenseClient(config.typesense)

    // 1. Add search endpoints if enabled
    if (config.search?.enabled) {
      const searchEndpoints = createSearchEndpoints(typesenseClient, {
        typesense: config.typesense,
        features: {
          embedding: config.embeddingConfig,
          search: config.search
        },
        collections: config.collections || {},
        documentTypeResolver: config.documentTypeResolver
      })

      payloadConfig.endpoints = [...(payloadConfig.endpoints || []), ...searchEndpoints]

      logger.debug('Search endpoints registered', {
        endpointsCount: searchEndpoints.length
      })
    }

    // 2. Add RAG endpoints if callbacks are configured
    if (config.callbacks) {
      const ragEndpoints = createRAGPayloadHandlers({
        typesense: config.typesense,
        collectionName: config.collectionName,
        embeddingConfig: config.embeddingConfig,
        callbacks: config.callbacks,
        hybrid: config.hybrid,
        hnsw: config.hnsw,
        advanced: config.advanced,
        documentTypeResolver: config.documentTypeResolver
      })

      payloadConfig.endpoints = [...(payloadConfig.endpoints || []), ...ragEndpoints]

      logger.debug('RAG endpoints registered', {
        endpointsCount: ragEndpoints.length
      })
    }

    // 3. Initialize on startup (schema sync + agent sync)
    const incomingOnInit = payloadConfig.onInit
    payloadConfig.onInit = async payload => {
      if (incomingOnInit) {
        await incomingOnInit(payload)
      }

      try {
        // A. Sync Typesense collections schema
        if (config.collections && Object.keys(config.collections).length > 0) {
          logger.info('Syncing Typesense collections schema...')
          const schemaManager = new SchemaManager(typesenseClient, {
            typesense: config.typesense,
            features: {
              embedding: config.embeddingConfig
            },
            collections: config.collections
          })
          await schemaManager.syncCollections()
        }
      } catch (error) {
        // Fail soft: Log error but don't crash Payload startup
        logger.error('Error initializing Typesense resources', error as Error)
      }
    }

    return payloadConfig
  }
}
