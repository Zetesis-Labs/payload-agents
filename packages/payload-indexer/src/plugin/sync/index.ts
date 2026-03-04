/**
 * Sync module exports
 */

export type { SyncOptions } from './document-syncer'
export {
  DocumentSyncer,
  deleteDocumentFromIndex,
  syncDocumentToIndex
} from './document-syncer'
export { applySyncHooks } from './hooks'
