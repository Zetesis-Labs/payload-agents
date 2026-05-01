/**
 * Generic indexer plugin factory
 * Creates a Payload CMS plugin that handles document syncing to any search backend
 */

import type { CollectionConfig, Config } from 'payload'
import type { IndexerAdapter } from '../adapter/types'
import { Logger } from '../core/logging/logger'
import type { FieldMapping, PayloadDocument, TableConfig } from '../document/types'
import { GeminiEmbeddingProvider } from '../embedding/providers/gemini-provider'
import { OpenAIEmbeddingProvider } from '../embedding/providers/openai-provider'
import { EmbeddingServiceImpl } from '../embedding/service'
import type { EmbeddingProviderConfig, EmbeddingService } from '../embedding/types'
import { createSyncStatusEndpoints } from '../sync-status/create-sync-status-endpoint'
import { checkSyncStatus } from '../sync-status/sync-status-service'
import type { SyncStatusValue } from '../sync-status/types'
import { applySyncHooks, type EmbeddingResolver } from './sync/hooks'
import type { IndexerPluginConfig, SyncFeatureConfig } from './types'

/**
 * Result of plugin creation containing the plugin function and internal services
 */
export interface IndexerPluginResult {
  /** The Payload plugin function */
  plugin: (config: Config) => Config
  /**
   * The plugin-level embedding service (if `features.embedding` is set).
   * Tables that declare their own `embedding.provider` get a separate
   * service — use `embeddingResolver` to look it up.
   */
  embeddingService?: EmbeddingService
  /**
   * Resolves the embedding service to use for a given table. Returns the
   * per-table service when the table declares `embedding.provider`, the
   * plugin-level service as a fallback, and `undefined` when the table
   * uses `autoEmbed` (the backend handles embedding) or has no embedding.
   */
  embeddingResolver: EmbeddingResolver
  /** The adapter instance */
  adapter: IndexerAdapter
}

const buildEmbeddingService = (config: EmbeddingProviderConfig, logger: Logger): EmbeddingService => {
  const provider =
    config.type === 'gemini' ? new GeminiEmbeddingProvider(config, logger) : new OpenAIEmbeddingProvider(config, logger)
  return new EmbeddingServiceImpl(provider, logger, config)
}

/**
 * Creates an indexer plugin for Payload CMS
 *
 * This is the main factory function for creating a search indexer plugin.
 * It handles:
 * - Embedding service creation (optional)
 * - Sync hooks for document create/update/delete
 *
 * Schema management and search endpoints should be handled by the adapter-specific wrapper
 * (e.g., typesenseSearch) as they have backend-specific requirements.
 *
 * @param config - Plugin configuration
 * @returns Object containing the plugin function and created services
 *
 * @example
 * ```typescript
 * import { createIndexerPlugin } from '@zetesis/payload-indexer';
 * import { createTypesenseAdapter } from '@zetesis/payload-typesense';
 *
 * const adapter = createTypesenseAdapter({ apiKey: '...', nodes: [...] });
 *
 * // TypeScript infers TFieldMapping from the adapter
 * const { plugin, embeddingService } = createIndexerPlugin({
 *   adapter,
 *   features: {
 *     embedding: { type: 'openai', apiKey: '...' },
 *     sync: { enabled: true }
 *   },
 *   collections: {
 *     posts: [{
 *       enabled: true,
 *       fields: [
 *         { name: 'title', type: 'string' },      // ✅ Valid Typesense field
 *         { name: 'views', type: 'int64' },       // ✅ Valid Typesense field
 *         { name: 'tags', type: 'string[]', facet: true }, // ✅ With faceting
 *       ]
 *     }]
 *   }
 * });
 *
 * export default buildConfig({
 *   plugins: [plugin]
 * });
 * ```
 */
export function createIndexerPlugin<TFieldMapping extends FieldMapping>(
  config: IndexerPluginConfig<TFieldMapping>
): IndexerPluginResult {
  const { adapter, features, collections } = config
  const logger = new Logger({ enabled: true, prefix: '[payload-indexer]' })

  // 1. Plugin-level embedding service (optional global default)
  const embeddingService = features.embedding ? buildEmbeddingService(features.embedding, logger) : undefined
  if (embeddingService && features.embedding) {
    logger.debug('Embedding service initialized', { provider: features.embedding.type })
  }

  // 2. Per-table embedding services. Built lazily and memoized so two tables
  //    that share an identical provider config reuse the same client.
  const perTableServices = new Map<EmbeddingProviderConfig, EmbeddingService>()
  const embeddingResolver: EmbeddingResolver = (_collectionSlug, tableConfig) => {
    if (tableConfig.embedding?.autoEmbed) return undefined
    const provider = tableConfig.embedding?.provider
    if (!provider) return embeddingService
    const cached = perTableServices.get(provider)
    if (cached) return cached
    const built = buildEmbeddingService(provider, logger)
    perTableServices.set(provider, built)
    logger.debug('Per-table embedding service initialized', { provider: provider.type })
    return built
  }

  // 3. Create the plugin function
  const plugin = (payloadConfig: Config): Config => {
    // Apply sync hooks to collections
    if (payloadConfig.collections && features.sync?.enabled) {
      payloadConfig.collections = applySyncHooks(payloadConfig.collections, config, adapter, embeddingResolver)

      logger.debug('Sync hooks applied to collections', {
        collectionsCount: Object.keys(collections).length
      })
    }

    // Register sync status REST endpoints and inject virtual field
    if (features.sync?.enabled) {
      const syncStatusEndpoints = createSyncStatusEndpoints({ adapter, collections, embeddingService })
      payloadConfig.endpoints = [...(payloadConfig.endpoints || []), ...syncStatusEndpoints]

      // Inject _syncStatus virtual field into indexed collections
      if (payloadConfig.collections) {
        payloadConfig.collections = injectSyncStatusField(
          payloadConfig.collections,
          collections,
          adapter,
          features.sync
        )
      }

      logger.debug('Sync status endpoints and virtual fields registered')
    }

    return payloadConfig
  }

  return {
    plugin,
    embeddingService,
    embeddingResolver,
    adapter
  }
}

/**
 * Creates an afterRead hook that computes sync status by comparing content hashes with the index
 */
function createSyncStatusAfterRead(adapter: IndexerAdapter, collectionSlug: string, tableConfigs: TableConfig[]) {
  return async ({ siblingData }: { siblingData: Record<string, unknown> }): Promise<SyncStatusValue> => {
    if (!siblingData?.id) return 'not-indexed'

    const enabledConfig = tableConfigs.find(tc => tc.enabled)
    if (!enabledConfig) return 'not-indexed'

    try {
      const result = await checkSyncStatus(
        adapter,
        collectionSlug,
        siblingData as unknown as PayloadDocument,
        enabledConfig
      )
      return result.status
    } catch {
      return 'error'
    }
  }
}

/**
 * Injects the _syncStatus virtual field into collections that have indexer tables configured
 */
function injectSyncStatusField(
  payloadCollections: CollectionConfig[],
  indexedCollections: Record<string, TableConfig[]>,
  adapter: IndexerAdapter,
  syncConfig?: SyncFeatureConfig
): CollectionConfig[] {
  return payloadCollections.map(collection => {
    const tableConfigs = indexedCollections[collection.slug]
    if (!tableConfigs) return collection

    // Per-collection `admin.defaultColumns` wins over the global sync default
    // — the global is a fallback for collections that haven't picked their
    // own admin columns. Inverting this would silently override every
    // collection's bespoke list (filename/parse_status for documents, etc).
    const defaultColumns = collection.admin?.defaultColumns ?? syncConfig?.defaultColumns

    return {
      ...collection,
      admin: {
        ...collection.admin,
        ...(defaultColumns ? { defaultColumns } : {})
      },
      fields: [
        ...(collection.fields || []),
        {
          name: '_syncStatus',
          label: 'Typesense Sync',
          type: 'select' as const,
          virtual: true,
          options: [
            { label: 'Synced', value: 'synced' },
            { label: 'Outdated', value: 'outdated' },
            { label: 'Not Indexed', value: 'not-indexed' },
            { label: 'Error', value: 'error' }
          ],
          hooks: {
            afterRead: [createSyncStatusAfterRead(adapter, collection.slug, tableConfigs)]
          },
          admin: {
            position: 'sidebar',
            components: {
              Field: '@zetesis/payload-indexer/client#SyncStatusField',
              Cell: '@zetesis/payload-indexer/client#SyncStatusCell'
            }
          }
        }
      ]
    }
  })
}
