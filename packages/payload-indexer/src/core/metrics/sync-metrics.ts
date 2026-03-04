/**
 * In-memory sync metrics for observability.
 *
 * Tracks counters for sync operations, chunk processing, and embedding failures.
 * Consumers can poll via `getSyncMetrics()` or subscribe via `onMetricsUpdate`.
 *
 * Limitation: single-instance, in-memory. Resets on process restart.
 * For persistent metrics, use the `onMetricsUpdate` callback to forward to
 * your preferred metrics backend (Prometheus, Datadog, etc.).
 */

export interface SyncMetrics {
  /** Total sync operations attempted */
  syncAttempts: number
  /** Total successful sync operations */
  syncSuccesses: number
  /** Total failed sync operations */
  syncFailures: number
  /** Total chunks successfully synced */
  chunksProcessed: number
  /** Total chunks skipped due to embedding failure */
  embeddingFailures: number
  /** Total documents deleted from index */
  deletions: number
  /** Timestamp of the last sync operation (ISO string) */
  lastSyncAt: string | null
  /** Timestamp of the last failure (ISO string) */
  lastFailureAt: string | null
}

export type MetricsEvent =
  | { type: 'sync_success'; collection: string; docId: string; chunks?: number }
  | { type: 'sync_failure'; collection: string; docId: string; error: string }
  | { type: 'embedding_failure'; collection: string; docId: string; chunkIndex: number }
  | { type: 'deletion'; collection: string; docId: string }

type MetricsListener = (event: MetricsEvent, snapshot: SyncMetrics) => void

const metrics: SyncMetrics = {
  syncAttempts: 0,
  syncSuccesses: 0,
  syncFailures: 0,
  chunksProcessed: 0,
  embeddingFailures: 0,
  deletions: 0,
  lastSyncAt: null,
  lastFailureAt: null
}

let listener: MetricsListener | null = null

/**
 * Get a snapshot of current sync metrics.
 */
export function getSyncMetrics(): Readonly<SyncMetrics> {
  return { ...metrics }
}

/**
 * Reset all metrics to zero. Useful for testing.
 */
export function resetSyncMetrics(): void {
  metrics.syncAttempts = 0
  metrics.syncSuccesses = 0
  metrics.syncFailures = 0
  metrics.chunksProcessed = 0
  metrics.embeddingFailures = 0
  metrics.deletions = 0
  metrics.lastSyncAt = null
  metrics.lastFailureAt = null
}

/**
 * Subscribe to metrics events. Only one listener is supported;
 * subsequent calls replace the previous listener.
 */
export function onMetricsUpdate(fn: MetricsListener | null): void {
  listener = fn
}

function emit(event: MetricsEvent): void {
  if (listener) listener(event, { ...metrics })
}

/** Record a successful sync operation. */
export function recordSyncSuccess(collection: string, docId: string, chunks?: number): void {
  metrics.syncAttempts++
  metrics.syncSuccesses++
  if (chunks !== undefined) metrics.chunksProcessed += chunks
  metrics.lastSyncAt = new Date().toISOString()
  emit({ type: 'sync_success', collection, docId, chunks })
}

/** Record a failed sync operation. */
export function recordSyncFailure(collection: string, docId: string, error: string): void {
  metrics.syncAttempts++
  metrics.syncFailures++
  metrics.lastFailureAt = new Date().toISOString()
  emit({ type: 'sync_failure', collection, docId, error })
}

/** Record an embedding failure for a single chunk. */
export function recordEmbeddingFailure(collection: string, docId: string, chunkIndex: number): void {
  metrics.embeddingFailures++
  emit({ type: 'embedding_failure', collection, docId, chunkIndex })
}

/** Record a document deletion. */
export function recordDeletion(collection: string, docId: string): void {
  metrics.deletions++
  emit({ type: 'deletion', collection, docId })
}
