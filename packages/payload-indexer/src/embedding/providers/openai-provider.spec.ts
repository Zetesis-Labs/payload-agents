import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class {
    embeddings = { create: mockCreate }
  }
}))

import type { Logger } from '../../core/logging/logger'
import type { OpenAIProviderConfig } from '../types'
import { OpenAIEmbeddingProvider } from './openai-provider'

describe('OpenAIEmbeddingProvider', () => {
  const mockLogger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }

  const config: OpenAIProviderConfig = {
    type: 'openai',
    apiKey: 'test-key',
    model: 'text-embedding-3-small',
    dimensions: 1536
  }

  let provider: OpenAIEmbeddingProvider

  beforeEach(() => {
    mockCreate.mockReset()
    provider = new OpenAIEmbeddingProvider(config, mockLogger)
  })

  describe('constructor', () => {
    it('throws if apiKey is missing (fail fast)', () => {
      expect(() => new OpenAIEmbeddingProvider({ ...config, apiKey: '' }, mockLogger)).toThrow(
        'OpenAI API key is required'
      )
    })
  })

  describe('generateEmbedding', () => {
    it('returns embedding with usage on success', async () => {
      mockCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { prompt_tokens: 5, total_tokens: 5 }
      })

      const result = await provider.generateEmbedding('hello world')

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        usage: { promptTokens: 5, totalTokens: 5 }
      })
    })

    it('returns null for empty text (no API call)', async () => {
      const result = await provider.generateEmbedding('')

      expect(result).toBeNull()
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('returns null for text below MIN_EMBEDDING_TEXT_LENGTH', async () => {
      // MIN_EMBEDDING_TEXT_LENGTH is 1, so only whitespace-only triggers this
      const result = await provider.generateEmbedding('   ')

      expect(result).toBeNull()
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('returns null on API error (does not throw)', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit'))

      const result = await provider.generateEmbedding('hello world')

      expect(result).toBeNull()
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('returns null when response has no embedding data', async () => {
      mockCreate.mockResolvedValue({
        data: [],
        usage: { prompt_tokens: 0, total_tokens: 0 }
      })

      const result = await provider.generateEmbedding('hello world')

      expect(result).toBeNull()
    })
  })

  describe('generateBatchEmbeddings', () => {
    it('filters out invalid texts before API call', async () => {
      mockCreate.mockResolvedValue({
        data: [{ embedding: [0.1] }],
        usage: { prompt_tokens: 3, total_tokens: 3 }
      })

      await provider.generateBatchEmbeddings(['valid text', '', '  '])

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: ['valid text']
        })
      )
    })

    it('returns null on API error (does not throw)', async () => {
      mockCreate.mockRejectedValue(new Error('API error'))

      const result = await provider.generateBatchEmbeddings(['hello', 'world'])

      expect(result).toBeNull()
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })
})
