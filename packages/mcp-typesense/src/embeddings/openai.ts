/**
 * OpenAI embedding service. Lazily instantiated per server.
 *
 * If `apiKey` is empty, `generate()` always resolves to `null` and tools fall
 * back to lexical search. This preserves behavior from the original
 * apps/mcp where a missing OPENAI_API_KEY degraded semantic/hybrid to lexical.
 */

import OpenAI from 'openai'
import type { EmbeddingService } from '../context'
import type { EmbeddingConfig } from '../types'

export function createOpenAIEmbeddings(config: EmbeddingConfig): EmbeddingService {
  let client: OpenAI | null = null

  function getClient(): OpenAI | null {
    if (!config.apiKey) return null
    if (!client) {
      client = new OpenAI({ apiKey: config.apiKey })
    }
    return client
  }

  return {
    dimensions: config.dimensions,
    model: config.model,
    async generate(text: string): Promise<number[] | null> {
      const c = getClient()
      if (!c) return null
      try {
        const response = await c.embeddings.create({
          model: config.model,
          input: text,
          dimensions: config.dimensions
        })
        return response.data[0]?.embedding ?? null
      } catch {
        return null
      }
    }
  }
}
