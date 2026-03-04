/**
 * Sync status types for comparing Payload documents against their indexed counterparts
 */

export type SyncStatusValue = 'synced' | 'outdated' | 'not-indexed' | 'error'

export interface SyncStatusResult {
  status: SyncStatusValue
  documentId: string
  /** Current content hash computed from Payload document */
  currentHash?: string
  /** Stored content hash from the index */
  indexedHash?: string
  /** Error message if status is 'error' */
  error?: string
}

export interface BatchSyncStatusResult {
  results: Map<string, SyncStatusResult>
  /** Number of documents checked */
  total: number
  /** Counts by status */
  counts: Record<SyncStatusValue, number>
}
