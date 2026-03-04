import { vi } from 'vitest'
import type { IndexerAdapter } from '../adapter/types'

export function createMockAdapter(overrides: Partial<IndexerAdapter> = {}): IndexerAdapter {
  return {
    name: 'mock-adapter',
    testConnection: vi.fn().mockResolvedValue(true),
    ensureCollection: vi.fn().mockResolvedValue(undefined),
    collectionExists: vi.fn().mockResolvedValue(true),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
    upsertDocument: vi.fn().mockResolvedValue(undefined),
    upsertDocuments: vi.fn().mockResolvedValue(undefined),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    deleteDocumentsByFilter: vi.fn().mockResolvedValue(0),
    searchDocumentsByFilter: vi.fn().mockResolvedValue([]),
    updateDocument: vi.fn().mockResolvedValue(undefined),
    updateDocumentsByFilter: vi.fn().mockResolvedValue(0),
    ...overrides
  }
}
