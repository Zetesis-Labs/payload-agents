/**
 * Plugin module exports
 */

export type { IndexerPluginResult } from './create-indexer-plugin'
// Main factory
export { createIndexerPlugin } from './create-indexer-plugin'
export type { EmbeddingResolver, SyncOptions } from './sync'
// Sync utilities (for custom implementations)
export {
  applySyncHooks,
  DocumentSyncer,
  deleteDocumentFromIndex,
  syncDocumentToIndex
} from './sync'
// Types
export type {
  IndexerFeatureConfig,
  IndexerPluginConfig,
  SearchFeatureConfig,
  SearchMode,
  SyncErrorContext,
  SyncFeatureConfig
} from './types'

// Naming utilities
export { getIndexCollectionName } from './utils'
