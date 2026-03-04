import { vi } from 'vitest'
import type { EmbeddingService } from '../embedding/types'

export function createMockEmbeddingService(overrides: Partial<EmbeddingService> = {}): EmbeddingService {
  return {
    getEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    getEmbeddingsBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    getDimensions: vi.fn().mockReturnValue(3),
    ...overrides
  }
}
