/**
 * Sync module exports
 */

export type { SyncOptions } from './document-syncer'
export {
  DocumentSyncer,
  deleteDocumentFromIndex,
  syncDocumentToIndex
} from './document-syncer'
export type { EmbeddingResolver } from './hooks'
export { applySyncHooks } from './hooks'
