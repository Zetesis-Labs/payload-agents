import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSyncMetrics,
  onMetricsUpdate,
  recordDeletion,
  recordEmbeddingFailure,
  recordSyncFailure,
  recordSyncSuccess,
  resetSyncMetrics
} from './sync-metrics'

describe('sync-metrics', () => {
  beforeEach(() => {
    resetSyncMetrics()
    onMetricsUpdate(null)
  })

  describe('recordSyncSuccess', () => {
    it('adds chunksProcessed when chunks is provided', () => {
      recordSyncSuccess('posts', 'doc-1', 5)

      expect(getSyncMetrics().chunksProcessed).toBe(5)
    })

    it('updates lastSyncAt with ISO timestamp', () => {
      recordSyncSuccess('posts', 'doc-1')

      const m = getSyncMetrics()
      expect(m.lastSyncAt).not.toBeNull()
      expect(() => new Date(m.lastSyncAt as string)).not.toThrow()
    })
  })

  describe('recordSyncFailure', () => {
    it('increments syncAttempts and syncFailures', () => {
      recordSyncFailure('posts', 'doc-1', 'timeout')

      const m = getSyncMetrics()
      expect(m.syncAttempts).toBe(1)
      expect(m.syncFailures).toBe(1)
    })

    it('updates lastFailureAt', () => {
      recordSyncFailure('posts', 'doc-1', 'timeout')

      expect(getSyncMetrics().lastFailureAt).not.toBeNull()
    })

    it('does not increment syncSuccesses', () => {
      recordSyncFailure('posts', 'doc-1', 'timeout')

      expect(getSyncMetrics().syncSuccesses).toBe(0)
    })
  })

  describe('recordEmbeddingFailure', () => {
    it('only increments embeddingFailures', () => {
      recordEmbeddingFailure('posts', 'doc-1', 0)

      const m = getSyncMetrics()
      expect(m.embeddingFailures).toBe(1)
      expect(m.syncAttempts).toBe(0)
    })
  })

  describe('recordDeletion', () => {
    it('only increments deletions', () => {
      recordDeletion('posts', 'doc-1')

      const m = getSyncMetrics()
      expect(m.deletions).toBe(1)
      expect(m.syncAttempts).toBe(0)
    })
  })

  describe('getSyncMetrics', () => {
    it('returns a snapshot (mutations do not affect the return)', () => {
      recordSyncSuccess('posts', 'doc-1')
      const snapshot = getSyncMetrics()

      recordSyncSuccess('posts', 'doc-2')

      expect(snapshot.syncSuccesses).toBe(1)
      expect(getSyncMetrics().syncSuccesses).toBe(2)
    })
  })

  describe('resetSyncMetrics', () => {
    it('resets all counters to zero and timestamps to null', () => {
      recordSyncSuccess('posts', 'doc-1', 3)
      recordSyncFailure('posts', 'doc-2', 'err')
      recordEmbeddingFailure('posts', 'doc-3', 0)
      recordDeletion('posts', 'doc-4')

      resetSyncMetrics()

      const m = getSyncMetrics()
      expect(m.syncAttempts).toBe(0)
      expect(m.syncSuccesses).toBe(0)
      expect(m.syncFailures).toBe(0)
      expect(m.chunksProcessed).toBe(0)
      expect(m.embeddingFailures).toBe(0)
      expect(m.deletions).toBe(0)
      expect(m.lastSyncAt).toBeNull()
      expect(m.lastFailureAt).toBeNull()
    })
  })

  describe('onMetricsUpdate', () => {
    it('calls listener with event and snapshot on each record*', () => {
      const listener = vi.fn()
      onMetricsUpdate(listener)

      recordSyncSuccess('posts', 'doc-1', 2)

      expect(listener).toHaveBeenCalledOnce()
      expect(listener).toHaveBeenCalledWith(
        { type: 'sync_success', collection: 'posts', docId: 'doc-1', chunks: 2 },
        expect.objectContaining({ syncSuccesses: 1 })
      )
    })

    it('replaces previous listener (does not accumulate)', () => {
      const first = vi.fn()
      const second = vi.fn()

      onMetricsUpdate(first)
      onMetricsUpdate(second)
      recordSyncSuccess('posts', 'doc-1')

      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledOnce()
    })

    it('null clears the listener', () => {
      const listener = vi.fn()
      onMetricsUpdate(listener)
      onMetricsUpdate(null)

      recordSyncSuccess('posts', 'doc-1')

      expect(listener).not.toHaveBeenCalled()
    })
  })
})
