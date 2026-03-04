import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockTypesenseClient, type MockTypesenseClient } from '../__test-utils__/mock-typesense-client'

vi.mock('../core/logging/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('./retry', () => ({
  withRetry: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn()),
  isTransientError: vi.fn().mockReturnValue(false)
}))

import { withRetry } from './retry'
import { TypesenseAdapter } from './typesense-adapter'

describe('TypesenseAdapter', () => {
  let mockClient: MockTypesenseClient
  let adapter: TypesenseAdapter

  beforeEach(() => {
    mockClient = createMockTypesenseClient()
    adapter = new TypesenseAdapter(mockClient as never)
    vi.mocked(withRetry).mockImplementation(async (fn: () => Promise<unknown>) => fn())
  })

  describe('ensureCollection', () => {
    it('creates collection when retrieve returns 404', async () => {
      mockClient._mocks.collectionOps.retrieve.mockRejectedValue({ httpStatus: 404 })

      await adapter.ensureCollection({ name: 'posts', fields: [] })

      expect(mockClient._mocks.collectionsOps.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'posts' }))
    })

    it('updates collection with new fields when exists', async () => {
      mockClient._mocks.collectionOps.retrieve.mockResolvedValue({
        name: 'posts',
        fields: [{ name: 'title', type: 'string' }],
        num_documents: 10
      })

      await adapter.ensureCollection({
        name: 'posts',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'content', type: 'string' }
        ]
      })

      expect(mockClient._mocks.collectionOps.update).toHaveBeenCalledWith({
        fields: [expect.objectContaining({ name: 'content' })]
      })
    })

    it('propagates non-404 errors', async () => {
      mockClient._mocks.collectionOps.retrieve.mockRejectedValue({ httpStatus: 500 })

      await expect(adapter.ensureCollection({ name: 'posts', fields: [] })).rejects.toEqual({ httpStatus: 500 })
    })
  })

  describe('collectionExists', () => {
    it('returns false on 404', async () => {
      mockClient._mocks.collectionOps.retrieve.mockRejectedValue({ httpStatus: 404 })

      expect(await adapter.collectionExists('posts')).toBe(false)
    })

    it('propagates non-404 errors', async () => {
      mockClient._mocks.collectionOps.retrieve.mockRejectedValue({ httpStatus: 500 })

      await expect(adapter.collectionExists('posts')).rejects.toEqual({ httpStatus: 500 })
    })
  })

  describe('deleteDocument', () => {
    it('silently succeeds on 404 (already deleted)', async () => {
      mockClient._mocks.documentOps.delete.mockRejectedValue({ httpStatus: 404 })

      await expect(adapter.deleteDocument('posts', 'doc-1')).resolves.toBeUndefined()
    })

    it('propagates non-404 errors', async () => {
      mockClient._mocks.documentOps.delete.mockRejectedValue({ httpStatus: 500 })

      await expect(adapter.deleteDocument('posts', 'doc-1')).rejects.toEqual({ httpStatus: 500 })
    })

    it('wraps call in withRetry', async () => {
      await adapter.deleteDocument('posts', 'doc-1')

      expect(withRetry).toHaveBeenCalledWith(expect.any(Function), 'deleteDocument(posts, doc-1)', undefined)
    })
  })

  describe('deleteCollection', () => {
    it('silently succeeds on 404', async () => {
      mockClient._mocks.collectionOps.delete.mockRejectedValue({ httpStatus: 404 })

      await expect(adapter.deleteCollection('posts')).resolves.toBeUndefined()
    })

    it('propagates non-404 errors', async () => {
      mockClient._mocks.collectionOps.delete.mockRejectedValue({ httpStatus: 500 })

      await expect(adapter.deleteCollection('posts')).rejects.toEqual({ httpStatus: 500 })
    })
  })

  describe('upsertDocument', () => {
    it('wraps call in withRetry', async () => {
      await adapter.upsertDocument('posts', { id: 'doc-1', title: 'Test' })

      expect(withRetry).toHaveBeenCalledWith(expect.any(Function), 'upsertDocument(posts, doc-1)', undefined)
    })

    it('propagates error after logging', async () => {
      mockClient._mocks.documentOps.upsert.mockRejectedValue(new Error('network error'))

      await expect(adapter.upsertDocument('posts', { id: 'doc-1' })).rejects.toThrow('network error')
    })
  })
})
