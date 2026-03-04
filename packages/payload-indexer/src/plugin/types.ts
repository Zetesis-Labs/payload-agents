/**
 * Plugin configuration types
 */

import type { CollectionSlug } from 'payload'
import type { IndexerAdapter } from '../adapter/types'
import type { FieldMapping, TableConfig } from '../document/types'
import type { EmbeddingProviderConfig } from '../embedding/types'

/**
 * Context passed to the onSyncError callback
 */
export interface SyncErrorContext {
  collectionSlug: string
  docId: string
  operation: string
}

/**
 * Sync feature configuration
 */
export interface SyncFeatureConfig {
  enabled: boolean
  /** Whether to auto-sync on document changes (default: true) */
  autoSync?: boolean
  /** Batch size for bulk operations */
  batchSize?: number
  /** Default columns to show in the list view for indexed collections */
  defaultColumns?: string[]
  /**
   * Called when a sync operation fails in a hook.
   * The error is always re-thrown after this callback.
   */
  onSyncError?: (error: Error, ctx: SyncErrorContext) => void | Promise<void>
}

/**
 * Search mode types
 */
export type SearchMode = 'semantic' | 'keyword' | 'hybrid'

/**
 * Search feature configuration
 */
export interface SearchFeatureConfig {
  enabled: boolean
  defaults?: {
    mode?: SearchMode
    perPage?: number
    tables?: string[]
  }
}

/**
 * Feature flags for the indexer plugin
 */
export interface IndexerFeatureConfig {
  /** Embedding provider configuration */
  embedding?: EmbeddingProviderConfig
  /** Sync feature configuration */
  sync?: SyncFeatureConfig
  /** Search feature configuration */
  search?: SearchFeatureConfig
}

export type IndexableCollectionConfig<TFieldMapping extends FieldMapping> = Record<
  CollectionSlug | string,
  TableConfig<TFieldMapping>[]
>

/**
 * Main plugin configuration
 *
 * @typeParam TFieldMapping - The field mapping type for collection fields
 */
export interface IndexerPluginConfig<TFieldMapping extends FieldMapping = FieldMapping> {
  /** The adapter to use for indexing operations */
  adapter: IndexerAdapter
  /** Feature configuration */
  features: IndexerFeatureConfig
  /** Collection configurations */
  collections: IndexableCollectionConfig<TFieldMapping>
}
