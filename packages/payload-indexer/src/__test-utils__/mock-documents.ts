import type { PayloadDocument, TableConfig } from '../document/types'

export function createMockDocument(overrides: Partial<PayloadDocument> = {}): PayloadDocument {
  return {
    id: 'doc-1',
    slug: 'test-document',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    publishedAt: '2024-01-01T12:00:00.000Z',
    title: 'Test Document',
    content: 'Test content for indexing',
    ...overrides
  }
}

export function createMockTableConfig(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    enabled: true,
    fields: [
      { name: 'title', payloadField: 'title' },
      { name: 'content', payloadField: 'content' }
    ],
    ...overrides
  }
}

export function createMockChunkedTableConfig(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    enabled: true,
    fields: [{ name: 'title', payloadField: 'title' }],
    embedding: {
      fields: ['content'],
      chunking: {
        strategy: 'text',
        size: 500,
        overlap: 50
      },
      autoEmbed: {
        from: ['chunk_text'],
        modelConfig: { modelName: 'mock-model' }
      }
    },
    ...overrides
  }
}
