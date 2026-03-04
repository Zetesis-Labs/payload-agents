/**
 * Sync hooks for Payload collections
 * Adapter-agnostic implementation
 */

import type { CollectionConfig } from 'payload'
import type { IndexerAdapter } from '../../adapter/types'
import { logger } from '../../core/logging/logger'
import { recordSyncFailure } from '../../core/metrics/sync-metrics'
import type { PayloadDocument, TableConfig } from '../../document/types'
import type { EmbeddingService } from '../../embedding/types'
import type { IndexerPluginConfig, SyncFeatureConfig } from '../types'
import { deleteDocumentFromIndex, type SyncOptions, syncDocumentToIndex } from './document-syncer'

/**
 * Processes a single table config during afterChange, handling shouldIndex and sync
 */
const processTableConfigAfterChange = async (
  tableConfig: TableConfig,
  adapter: IndexerAdapter,
  collectionSlug: string,
  doc: PayloadDocument,
  operation: 'create' | 'update',
  embeddingService?: EmbeddingService,
  options?: SyncOptions
): Promise<void> => {
  if (!tableConfig.enabled) return

  if (tableConfig.shouldIndex) {
    const shouldIndex = await tableConfig.shouldIndex(doc)
    if (!shouldIndex) {
      await deleteDocumentFromIndex(adapter, collectionSlug, doc.id, tableConfig)
      return
    }
  }

  await syncDocumentToIndex(adapter, collectionSlug, doc, operation, tableConfig, embeddingService, options)
}

/**
 * Creates the afterChange hook handler for a collection
 */
const createAfterChangeHook = (
  tableConfigs: TableConfig[],
  adapter: IndexerAdapter,
  collectionSlug: string,
  embeddingService?: EmbeddingService,
  onSyncError?: SyncFeatureConfig['onSyncError']
) => {
  return async ({
    doc,
    operation,
    req
  }: {
    doc: PayloadDocument
    operation: 'create' | 'update'
    req: { context?: Record<string, unknown> }
  }) => {
    if (req.context?.skipIndexSync) return

    const syncOptions: SyncOptions = {
      forceReindex: req.context?.forceReindex === true
    }

    try {
      for (const tableConfig of tableConfigs) {
        await processTableConfigAfterChange(
          tableConfig,
          adapter,
          collectionSlug,
          doc,
          operation,
          embeddingService,
          syncOptions
        )
      }
    } catch (error) {
      const syncError = error instanceof Error ? error : new Error(String(error))
      recordSyncFailure(collectionSlug, String(doc.id), syncError.message)
      logger.error('Sync hook failed', syncError, {
        collection: collectionSlug,
        docId: String(doc.id),
        operation
      })

      if (onSyncError) {
        await onSyncError(syncError, {
          collectionSlug,
          docId: String(doc.id),
          operation
        })
      }

      throw error
    }
  }
}

/**
 * Creates the afterDelete hook handler for a collection
 */
const createAfterDeleteHook = (tableConfigs: TableConfig[], adapter: IndexerAdapter, collectionSlug: string) => {
  return async ({ doc }: { doc: PayloadDocument; req: unknown }) => {
    await deleteDocumentFromIndex(
      adapter,
      collectionSlug,
      doc.id,
      tableConfigs.filter(tableConfig => tableConfig.enabled)
    )
  }
}

/**
 * Applies sync hooks to Payload collections
 * Uses the adapter pattern for backend-agnostic indexing
 */
export const applySyncHooks = (
  collections: CollectionConfig[],
  pluginConfig: IndexerPluginConfig,
  adapter: IndexerAdapter,
  embeddingService?: EmbeddingService
): CollectionConfig[] => {
  if (
    !pluginConfig.features.sync?.enabled ||
    pluginConfig.features.sync.autoSync === false ||
    !pluginConfig.collections
  ) {
    return collections
  }

  return (collections || []).map(collection => {
    const tableConfigs = pluginConfig.collections?.[collection.slug]

    const hasEnabledTables =
      tableConfigs && Array.isArray(tableConfigs) && tableConfigs.some(tableConfig => tableConfig.enabled)

    if (!hasEnabledTables) {
      return collection
    }

    logger.debug('Registering sync hooks for collection', {
      collection: collection.slug,
      tableCount: tableConfigs?.length || 0
    })

    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        afterChange: [
          ...(collection.hooks?.afterChange || []),
          createAfterChangeHook(
            tableConfigs,
            adapter,
            collection.slug,
            embeddingService,
            pluginConfig.features.sync?.onSyncError
          )
        ],
        afterDelete: [
          ...(collection.hooks?.afterDelete || []),
          createAfterDeleteHook(tableConfigs, adapter, collection.slug)
        ]
      }
    }
  })
}
