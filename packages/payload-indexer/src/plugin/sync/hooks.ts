/**
 * Sync hooks for Payload collections
 * Adapter-agnostic implementation
 */

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig, PayloadRequest } from 'payload'
import type { IndexerAdapter } from '../../adapter/types'
import { logger } from '../../core/logging/logger'
import { recordSyncFailure } from '../../core/metrics/sync-metrics'
import type { PayloadDocument, TableConfig } from '../../document/types'
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

  await syncDocumentToIndex(adapter, collectionSlug, doc, operation, tableConfig, options)
}

const resolveSyncDepth = (tableConfigs: TableConfig[]): number =>
  tableConfigs.reduce((max, tableConfig) => (tableConfig.enabled ? Math.max(max, tableConfig.syncDepth ?? 0) : max), 0)

const repopulateDoc = async (
  doc: PayloadDocument,
  collectionSlug: string,
  tableConfigs: TableConfig[],
  req: PayloadRequest
): Promise<PayloadDocument> => {
  const requestedDepth = resolveSyncDepth(tableConfigs)
  if (requestedDepth === 0 || !req.payload?.findByID) return doc

  try {
    const fresh = await req.payload.findByID({
      collection: collectionSlug,
      id: doc.id,
      depth: requestedDepth,
      overrideAccess: true,
      // Pass req so the read joins the same transaction as the save that
      // triggered the hook. Without this, Payload opens a new connection
      // and reads the pre-commit snapshot, returning stale field values
      // (e.g. the title from before the user's edit).
      req
    })
    return fresh && typeof fresh === 'object' ? (fresh as PayloadDocument) : doc
  } catch (error) {
    logger.warn('Failed to repopulate doc for indexing, using afterChange doc as-is', {
      collection: collectionSlug,
      docId: String(doc.id),
      requestedDepth,
      error: error instanceof Error ? error.message : String(error)
    })
    return doc
  }
}

/**
 * Creates the afterChange hook handler for a collection
 */
const createAfterChangeHook = (
  tableConfigs: TableConfig[],
  adapter: IndexerAdapter,
  collectionSlug: string,
  onSyncError?: SyncFeatureConfig['onSyncError']
): CollectionAfterChangeHook => {
  return async ({ doc, operation, req }) => {
    if (req.context?.skipIndexSync) return

    const syncOptions: SyncOptions = {
      forceReindex: req.context?.forceReindex === true
    }

    const payloadDoc = doc as PayloadDocument
    const populatedDoc = await repopulateDoc(payloadDoc, collectionSlug, tableConfigs, req)

    try {
      for (const tableConfig of tableConfigs) {
        await processTableConfigAfterChange(tableConfig, adapter, collectionSlug, populatedDoc, operation, syncOptions)
      }
    } catch (error) {
      const syncError = error instanceof Error ? error : new Error(String(error))
      recordSyncFailure(collectionSlug, String(payloadDoc.id), syncError.message)
      logger.error('Sync hook failed', syncError, {
        collection: collectionSlug,
        docId: String(payloadDoc.id),
        operation
      })

      if (onSyncError) {
        await onSyncError(syncError, {
          collectionSlug,
          docId: String(payloadDoc.id),
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
  const hook: CollectionAfterDeleteHook = async ({ doc }) => {
    const payloadDoc = doc as PayloadDocument
    await deleteDocumentFromIndex(
      adapter,
      collectionSlug,
      payloadDoc.id,
      tableConfigs.filter(tableConfig => tableConfig.enabled)
    )
  }
  return hook
}

/**
 * Applies sync hooks to Payload collections
 * Uses the adapter pattern for backend-agnostic indexing
 */
export const applySyncHooks = (
  collections: CollectionConfig[],
  pluginConfig: IndexerPluginConfig,
  adapter: IndexerAdapter
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
          createAfterChangeHook(tableConfigs, adapter, collection.slug, pluginConfig.features.sync?.onSyncError)
        ],
        afterDelete: [
          ...(collection.hooks?.afterDelete || []),
          createAfterDeleteHook(tableConfigs, adapter, collection.slug)
        ]
      }
    }
  })
}
