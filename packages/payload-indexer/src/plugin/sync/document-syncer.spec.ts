import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockAdapter } from '../../__test-utils__/mock-adapter'
import {
  createMockChunkedTableConfig,
  createMockDocument,
  createMockTableConfig
} from '../../__test-utils__/mock-documents'
import { createMockEmbeddingService } from '../../__test-utils__/mock-embedding'
import type { IndexerAdapter } from '../../adapter/types'
import type { EmbeddingService } from '../../embedding/types'

vi.mock('../../core/logging/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const mockMapPayloadDocumentToIndex = vi.fn().mockResolvedValue({ title: 'Test Document' })
vi.mock('../../document/field-mapper', () => ({
  mapPayloadDocumentToIndex: (...args: unknown[]) => mockMapPayloadDocumentToIndex(...args)
}))

const mockChunkText = vi.fn().mockResolvedValue([
  { text: 'chunk one', index: 0, metadata: {} },
  { text: 'chunk two', index: 1, metadata: {} }
])
vi.mock('../../embedding/chunking/strategies', () => ({
  chunkText: (...args: unknown[]) => mockChunkText(...args),
  chunkMarkdown: vi.fn().mockResolvedValue([])
}))

const mockComputeContentHash = vi.fn().mockReturnValue('abc123hash')
vi.mock('../../core/utils/content-hash', () => ({
  computeContentHash: (...args: unknown[]) => mockComputeContentHash(...args)
}))

const mockBuildHeaderHierarchy = vi.fn().mockReturnValue([])
vi.mock('../../core/utils/header-utils', () => ({
  buildHeaderHierarchy: (...args: unknown[]) => mockBuildHeaderHierarchy(...args)
}))

const mockFormatChunkWithHeaders = vi.fn().mockImplementation((text: string) => text)
vi.mock('../../core/utils/chunk-format-utils', () => ({
  formatChunkWithHeaders: (...args: unknown[]) => mockFormatChunkWithHeaders(...args)
}))

const mockRecordSyncSuccess = vi.fn()
const mockRecordEmbeddingFailure = vi.fn()
const mockRecordDeletion = vi.fn()
vi.mock('../../core/metrics/sync-metrics', () => ({
  recordSyncSuccess: (...args: unknown[]) => mockRecordSyncSuccess(...args),
  recordSyncFailure: vi.fn(),
  recordEmbeddingFailure: (...args: unknown[]) => mockRecordEmbeddingFailure(...args),
  recordDeletion: (...args: unknown[]) => mockRecordDeletion(...args)
}))

import { deleteDocumentFromIndex, syncDocumentToIndex } from './document-syncer'

describe('DocumentSyncer', () => {
  let adapter: IndexerAdapter
  let embeddingService: EmbeddingService

  beforeEach(() => {
    adapter = createMockAdapter()
    embeddingService = createMockEmbeddingService()
    mockRecordSyncSuccess.mockReset()
    mockRecordEmbeddingFailure.mockReset()
    mockRecordDeletion.mockReset()
    mockMapPayloadDocumentToIndex.mockReset().mockResolvedValue({ title: 'Test Document' })
    mockChunkText.mockReset().mockResolvedValue([
      { text: 'chunk one', index: 0, metadata: {} },
      { text: 'chunk two', index: 1, metadata: {} }
    ])
    mockComputeContentHash.mockReset().mockReturnValue('abc123hash')
    mockBuildHeaderHierarchy.mockReset().mockReturnValue([])
    mockFormatChunkWithHeaders.mockReset().mockImplementation((text: string) => text)
  })

  describe('syncDocument (non-chunked)', () => {
    it('maps fields and upserts document on create', async () => {
      const doc = createMockDocument()
      const config = createMockTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config)

      expect(adapter.upsertDocument).toHaveBeenCalledOnce()
      const upsertedDoc = vi.mocked(adapter.upsertDocument).mock.calls[0][1]
      expect(upsertedDoc.title).toBe('Test Document')
    })

    it('generates embedding when embeddingService exists', async () => {
      const doc = createMockDocument()
      const config = createMockTableConfig({
        embedding: { fields: ['content'] }
      })

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config, embeddingService)

      const upsertedDoc = vi.mocked(adapter.upsertDocument).mock.calls[0][1]
      expect(upsertedDoc.embedding).toEqual([0.1, 0.2, 0.3])
    })

    it('does not generate embedding without embeddingService', async () => {
      const doc = createMockDocument()
      const config = createMockTableConfig({
        embedding: { fields: ['content'] }
      })

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config)

      const upsertedDoc = vi.mocked(adapter.upsertDocument).mock.calls[0][1]
      expect(upsertedDoc.embedding).toBeUndefined()
    })
  })

  describe('syncDocument — content hash', () => {
    it('skips re-embedding on update if content unchanged', async () => {
      const doc = createMockDocument()
      const config = createMockTableConfig({
        embedding: { fields: ['content'] }
      })

      vi.mocked(
        adapter.searchDocumentsByFilter as NonNullable<typeof adapter.searchDocumentsByFilter>
      ).mockResolvedValue([{ content_hash: 'abc123hash' }])
      vi.mocked(adapter.updateDocument as NonNullable<typeof adapter.updateDocument>).mockResolvedValue(undefined)

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config, embeddingService)

      expect(adapter.updateDocument).toHaveBeenCalledOnce()
      expect(adapter.upsertDocument).not.toHaveBeenCalled()
    })

    it('re-embeds on update if content changed', async () => {
      const doc = createMockDocument()
      const config = createMockTableConfig({
        embedding: { fields: ['content'] }
      })

      vi.mocked(
        adapter.searchDocumentsByFilter as NonNullable<typeof adapter.searchDocumentsByFilter>
      ).mockResolvedValue([{ content_hash: 'different-hash' }])

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config, embeddingService)

      expect(adapter.upsertDocument).toHaveBeenCalledOnce()
    })

    it('re-embeds when forceReindex is true (ignores hash)', async () => {
      const doc = createMockDocument()
      const config = createMockTableConfig({
        embedding: { fields: ['content'] }
      })

      vi.mocked(
        adapter.searchDocumentsByFilter as NonNullable<typeof adapter.searchDocumentsByFilter>
      ).mockResolvedValue([{ content_hash: 'abc123hash' }])

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config, embeddingService, { forceReindex: true })

      expect(adapter.upsertDocument).toHaveBeenCalledOnce()
    })

    it('falls back to full sync if isContentUnchanged throws', async () => {
      const doc = createMockDocument()
      const config = createMockTableConfig({
        embedding: { fields: ['content'] }
      })

      vi.mocked(
        adapter.searchDocumentsByFilter as NonNullable<typeof adapter.searchDocumentsByFilter>
      ).mockRejectedValue(new Error('network error'))

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config, embeddingService)

      expect(adapter.upsertDocument).toHaveBeenCalledOnce()
    })
  })

  describe('syncChunked', () => {
    it('builds ALL chunks before mutating (batch atomicity)', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()
      const callOrder: string[] = []

      vi.mocked(embeddingService.getEmbedding).mockImplementation(async () => {
        callOrder.push('embed')
        return [0.1, 0.2, 0.3]
      })
      vi.mocked(adapter.deleteDocumentsByFilter).mockImplementation(async () => {
        callOrder.push('delete')
        return 0
      })
      vi.mocked(adapter.upsertDocuments).mockImplementation(async () => {
        callOrder.push('upsert')
      })

      await syncDocumentToIndex(adapter, 'posts', doc, 'update', config, embeddingService)

      const firstDelete = callOrder.indexOf('delete')
      const lastEmbed = callOrder.lastIndexOf('embed')
      expect(lastEmbed).toBeLessThan(firstDelete)
    })

    it('deletes old chunks only on update (not on create)', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config, embeddingService)

      expect(adapter.deleteDocumentsByFilter).not.toHaveBeenCalled()
    })

    it('calls upsertDocuments with all chunk docs', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config, embeddingService)

      expect(adapter.upsertDocuments).toHaveBeenCalledOnce()
      const chunks = vi.mocked(adapter.upsertDocuments).mock.calls[0][1]
      expect(chunks).toHaveLength(2)
      expect(chunks[0].id).toBe('doc-1_chunk_0')
      expect(chunks[1].id).toBe('doc-1_chunk_1')
    })

    it('records sync success with chunk count', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config, embeddingService)

      expect(mockRecordSyncSuccess).toHaveBeenCalledWith('posts', 'doc-1', 2)
    })

    it('returns early without source text (warn)', async () => {
      const doc = createMockDocument({ content: '' })
      const config = createMockChunkedTableConfig()

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config, embeddingService)

      expect(adapter.upsertDocuments).not.toHaveBeenCalled()
    })

    it('returns early if all chunks fail embedding', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig()

      vi.mocked(embeddingService.getEmbedding).mockResolvedValue(null)

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config, embeddingService)

      expect(adapter.upsertDocuments).not.toHaveBeenCalled()
    })
  })

  describe('buildChunkDocument — embedding failure behavior', () => {
    it('skip-chunk: returns null, chunk omitted from batch', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig({
        embedding: {
          fields: ['content'],
          chunking: { strategy: 'text', size: 500, overlap: 50 },
          onEmbeddingFailure: 'skip-chunk'
        }
      })

      vi.mocked(embeddingService.getEmbedding).mockResolvedValueOnce([0.1, 0.2, 0.3]).mockResolvedValueOnce(null)

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config, embeddingService)

      const chunks = vi.mocked(adapter.upsertDocuments).mock.calls[0][1]
      expect(chunks).toHaveLength(1)
    })

    it('error: throws Error', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig({
        embedding: {
          fields: ['content'],
          chunking: { strategy: 'text', size: 500, overlap: 50 },
          onEmbeddingFailure: 'error'
        }
      })

      vi.mocked(embeddingService.getEmbedding).mockResolvedValue(null)

      await expect(syncDocumentToIndex(adapter, 'posts', doc, 'create', config, embeddingService)).rejects.toThrow(
        'Embedding generation failed'
      )
    })

    it('empty-vector: returns doc with embedding: []', async () => {
      const doc = createMockDocument()
      const config = createMockChunkedTableConfig({
        embedding: {
          fields: ['content'],
          chunking: { strategy: 'text', size: 500, overlap: 50 },
          onEmbeddingFailure: 'empty-vector'
        }
      })

      vi.mocked(embeddingService.getEmbedding).mockResolvedValue(null)

      await syncDocumentToIndex(adapter, 'posts', doc, 'create', config, embeddingService)

      const chunks = vi.mocked(adapter.upsertDocuments).mock.calls[0][1]
      expect(chunks).toHaveLength(2)
      expect(chunks[0].embedding).toEqual([])
    })
  })

  describe('deleteDocumentFromIndex', () => {
    it('deletes by parent_doc_id for chunked tables', async () => {
      const config = createMockChunkedTableConfig()

      await deleteDocumentFromIndex(adapter, 'posts', 'doc-1', config)

      expect(adapter.deleteDocumentsByFilter).toHaveBeenCalledWith('posts', { parent_doc_id: 'doc-1' })
      expect(adapter.deleteDocument).not.toHaveBeenCalled()
    })

    it('deletes by id for non-chunked, fallback to parent_doc_id', async () => {
      const config = createMockTableConfig()

      await deleteDocumentFromIndex(adapter, 'posts', 'doc-1', config)

      expect(adapter.deleteDocument).toHaveBeenCalledWith('posts', 'doc-1')
    })

    it('records deletion metric when at least one delete succeeds', async () => {
      const config = createMockTableConfig()

      await deleteDocumentFromIndex(adapter, 'posts', 'doc-1', config)

      expect(mockRecordDeletion).toHaveBeenCalledWith('posts', 'doc-1')
    })
  })
})
