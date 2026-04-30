import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockAdapter } from '../../__test-utils__/mock-adapter'
import { createMockDocument, createMockTableConfig } from '../../__test-utils__/mock-documents'
import type { IndexerAdapter } from '../../adapter/types'
import type { IndexerPluginConfig } from '../types'

vi.mock('../../core/logging/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const mockSyncDocumentToIndex = vi.fn().mockResolvedValue(undefined)
const mockDeleteDocumentFromIndex = vi.fn().mockResolvedValue(undefined)
vi.mock('./document-syncer', () => ({
  syncDocumentToIndex: (...args: unknown[]) => mockSyncDocumentToIndex(...args),
  deleteDocumentFromIndex: (...args: unknown[]) => mockDeleteDocumentFromIndex(...args)
}))

const mockRecordSyncFailure = vi.fn()
vi.mock('../../core/metrics/sync-metrics', () => ({
  recordSyncFailure: (...args: unknown[]) => mockRecordSyncFailure(...args)
}))

import { applySyncHooks } from './hooks'

describe('sync hooks', () => {
  let adapter: IndexerAdapter

  beforeEach(() => {
    adapter = createMockAdapter()
    mockSyncDocumentToIndex.mockClear().mockResolvedValue(undefined)
    mockDeleteDocumentFromIndex.mockClear().mockResolvedValue(undefined)
    mockRecordSyncFailure.mockClear()
  })

  describe('createAfterChangeHook (via applySyncHooks)', () => {
    function getAfterChangeHook(
      tableConfigs = [createMockTableConfig()],
      onSyncError?: (error: Error, ctx: { collectionSlug: string; docId: string; operation: string }) => void
    ) {
      const collections = [
        {
          slug: 'posts' as string,
          fields: [],
          hooks: {}
        }
      ]

      const pluginConfig: IndexerPluginConfig = {
        adapter,
        features: {
          sync: { enabled: true, onSyncError }
        },
        collections: { posts: tableConfigs }
      }

      const result = applySyncHooks(collections, pluginConfig, adapter)
      const hooks = result[0]?.hooks?.afterChange
      return hooks?.[0]
    }

    it('calls syncDocumentToIndex for each enabled table config', async () => {
      const hook = getAfterChangeHook([createMockTableConfig(), createMockTableConfig()])

      await hook?.({
        doc: createMockDocument(),
        operation: 'create',
        req: {}
      })

      expect(mockSyncDocumentToIndex).toHaveBeenCalledTimes(2)
    })

    it('skips when req.context.skipIndexSync is true', async () => {
      const hook = getAfterChangeHook()

      await hook?.({
        doc: createMockDocument(),
        operation: 'create',
        req: { context: { skipIndexSync: true } }
      })

      expect(mockSyncDocumentToIndex).not.toHaveBeenCalled()
    })

    it('passes forceReindex from req.context', async () => {
      const hook = getAfterChangeHook()

      await hook?.({
        doc: createMockDocument(),
        operation: 'update',
        req: { context: { forceReindex: true } }
      })

      expect(mockSyncDocumentToIndex).toHaveBeenCalledWith(
        expect.anything(), // adapter
        'posts',
        expect.anything(), // doc
        'update',
        expect.anything(), // tableConfig
        undefined, // embeddingService
        { forceReindex: true }
      )
    })

    it('records sync failure and re-throws on error', async () => {
      mockSyncDocumentToIndex.mockRejectedValueOnce(new Error('sync failed'))

      const hook = getAfterChangeHook()

      await expect(
        hook?.({
          doc: createMockDocument(),
          operation: 'create',
          req: {}
        })
      ).rejects.toThrow('sync failed')

      expect(mockRecordSyncFailure).toHaveBeenCalledWith('posts', 'doc-1', 'sync failed')
    })

    it('calls onSyncError callback with context', async () => {
      mockSyncDocumentToIndex.mockRejectedValueOnce(new Error('sync failed'))
      const onSyncError = vi.fn()

      const hook = getAfterChangeHook([createMockTableConfig()], onSyncError)

      await expect(
        hook?.({
          doc: createMockDocument(),
          operation: 'create',
          req: {}
        })
      ).rejects.toThrow('sync failed')

      expect(onSyncError).toHaveBeenCalledWith(expect.any(Error), {
        collectionSlug: 'posts',
        docId: 'doc-1',
        operation: 'create'
      })
    })

    it('still throws after onSyncError', async () => {
      mockSyncDocumentToIndex.mockRejectedValueOnce(new Error('sync failed'))
      const onSyncError = vi.fn()

      const hook = getAfterChangeHook([createMockTableConfig()], onSyncError)

      await expect(
        hook?.({
          doc: createMockDocument(),
          operation: 'create',
          req: {}
        })
      ).rejects.toThrow('sync failed')
    })

    describe('syncDepth', () => {
      it('does not refetch when no table config sets syncDepth', async () => {
        const findByID = vi.fn()
        const hook = getAfterChangeHook([createMockTableConfig()])

        await hook?.({
          doc: createMockDocument(),
          operation: 'update',
          req: { payload: { findByID } }
        })

        expect(findByID).not.toHaveBeenCalled()
        expect(mockSyncDocumentToIndex).toHaveBeenCalledWith(
          expect.anything(),
          'posts',
          expect.objectContaining({ id: 'doc-1' }),
          'update',
          expect.anything(),
          undefined,
          expect.anything()
        )
      })

      it('refetches with the highest syncDepth and forwards the populated doc', async () => {
        const populatedDoc = createMockDocument({ title: 'populated' })
        const findByID = vi.fn().mockResolvedValue(populatedDoc)
        const hook = getAfterChangeHook([
          createMockTableConfig({ syncDepth: 1 }),
          createMockTableConfig({ syncDepth: 2 })
        ])

        await hook?.({
          doc: createMockDocument({ title: 'stale' }),
          operation: 'update',
          req: { payload: { findByID } }
        })

        expect(findByID).toHaveBeenCalledTimes(1)
        expect(findByID).toHaveBeenCalledWith(
          expect.objectContaining({
            collection: 'posts',
            id: 'doc-1',
            depth: 2,
            overrideAccess: true,
            req: expect.anything()
          })
        )
        expect(mockSyncDocumentToIndex).toHaveBeenCalledWith(
          expect.anything(),
          'posts',
          expect.objectContaining({ title: 'populated' }),
          'update',
          expect.anything(),
          undefined,
          expect.anything()
        )
      })

      it('falls back to the original doc when refetch throws', async () => {
        const findByID = vi.fn().mockRejectedValue(new Error('not found'))
        const hook = getAfterChangeHook([createMockTableConfig({ syncDepth: 1 })])

        await hook?.({
          doc: createMockDocument({ title: 'stale' }),
          operation: 'update',
          req: { payload: { findByID } }
        })

        expect(findByID).toHaveBeenCalledTimes(1)
        expect(mockSyncDocumentToIndex).toHaveBeenCalledWith(
          expect.anything(),
          'posts',
          expect.objectContaining({ title: 'stale' }),
          'update',
          expect.anything(),
          undefined,
          expect.anything()
        )
      })
    })
  })

  describe('processTableConfigAfterChange', () => {
    it('deletes doc when shouldIndex returns false', async () => {
      const config = createMockTableConfig({ shouldIndex: vi.fn().mockResolvedValue(false) })

      const collections = [{ slug: 'posts' as string, fields: [], hooks: {} }]
      const pluginConfig: IndexerPluginConfig = {
        adapter,
        features: { sync: { enabled: true } },
        collections: { posts: [config] }
      }
      const result = applySyncHooks(collections, pluginConfig, adapter)
      const hook = result[0]?.hooks?.afterChange?.[0]

      await hook?.({ doc: createMockDocument(), operation: 'create', req: {} })

      expect(mockDeleteDocumentFromIndex).toHaveBeenCalled()
      expect(mockSyncDocumentToIndex).not.toHaveBeenCalled()
    })

    it('syncs doc when shouldIndex returns true', async () => {
      const config = createMockTableConfig({ shouldIndex: vi.fn().mockResolvedValue(true) })

      const collections = [{ slug: 'posts' as string, fields: [], hooks: {} }]
      const pluginConfig: IndexerPluginConfig = {
        adapter,
        features: { sync: { enabled: true } },
        collections: { posts: [config] }
      }
      const result = applySyncHooks(collections, pluginConfig, adapter)
      const hook = result[0]?.hooks?.afterChange?.[0]

      await hook?.({ doc: createMockDocument(), operation: 'create', req: {} })

      expect(mockSyncDocumentToIndex).toHaveBeenCalled()
    })
  })

  describe('applySyncHooks', () => {
    it('returns collections unchanged if sync not enabled', () => {
      const collections = [{ slug: 'posts' as string, fields: [], hooks: {} }]
      const pluginConfig: IndexerPluginConfig = {
        adapter,
        features: { sync: { enabled: false } },
        collections: { posts: [createMockTableConfig()] }
      }

      const result = applySyncHooks(collections, pluginConfig, adapter)

      expect(result[0].hooks).toEqual({})
    })

    it('preserves existing hooks on collections', () => {
      const existingHook = vi.fn()
      const collections = [
        {
          slug: 'posts' as string,
          fields: [],
          hooks: { afterChange: [existingHook] }
        }
      ]
      const pluginConfig: IndexerPluginConfig = {
        adapter,
        features: { sync: { enabled: true } },
        collections: { posts: [createMockTableConfig()] }
      }

      const result = applySyncHooks(collections, pluginConfig, adapter)

      const afterChangeHooks = result[0].hooks?.afterChange
      expect(afterChangeHooks).toHaveLength(2)
      expect(afterChangeHooks?.[0]).toBe(existingHook)
    })
  })
})
