/**
 * DeepInfra reranker implementations.
 *
 * DeepInfra hosts both BGE Reranker v2 m3 and Jina Reranker v3 behind a
 * shared REST endpoint. The wire format is OpenAI/Cohere-compatible:
 *
 *   POST https://api.deepinfra.com/v1/inference/{model_id}
 *   Authorization: Bearer <DEEPINFRA_API_KEY>
 *   { "queries": ["..."], "documents": ["...", "...", ...] }
 *
 * The response includes a `scores` array aligned with `documents`. We
 * map those back onto the input candidates and sort descending.
 */

import type { RankedCandidate, Reranker, RerankerCandidate } from './types'

export interface DeepInfraRerankerConfig {
  /** DeepInfra API key. Required. */
  apiKey: string
  /** Override the API base. Default: `https://api.deepinfra.com/v1/inference`. */
  baseUrl?: string
  /** Request timeout in ms. Default: 15000. */
  timeoutMs?: number
}

interface DeepInfraResponse {
  scores?: number[]
  error?: { message?: string } | string
}

const DEFAULT_BASE_URL = 'https://api.deepinfra.com/v1/inference'
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Build a DeepInfra reranker bound to a specific model identifier (e.g.
 * `BAAI/bge-reranker-v2-m3`, `jinaai/jina-reranker-v2-base-multilingual`).
 * DeepInfra serves any of its hosted reranker models behind the same wire
 * format, so the factory just substitutes the model into the endpoint URL.
 */
export function createDeepInfraReranker(model: string, config: DeepInfraRerankerConfig): Reranker {
  if (!model) throw new Error('DeepInfra reranker requires a model identifier')
  if (!config.apiKey) throw new Error('DeepInfra reranker requires an apiKey')
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return async function deepInfraReranker<TOriginal>(
    query: string,
    candidates: RerankerCandidate<TOriginal>[]
  ): Promise<RankedCandidate<TOriginal>[]> {
    if (candidates.length === 0) return []

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetch(`${baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          queries: [query],
          documents: candidates.map(c => c.text)
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`DeepInfra reranker request failed (${response.status}): ${text || response.statusText}`)
    }

    const data = (await response.json()) as DeepInfraResponse
    if (data.error) {
      const msg = typeof data.error === 'string' ? data.error : (data.error.message ?? 'unknown error')
      throw new Error(`DeepInfra reranker returned an error: ${msg}`)
    }

    const scores = data.scores
    if (!Array.isArray(scores) || scores.length !== candidates.length) {
      throw new Error(
        `DeepInfra reranker response shape unexpected: expected ${candidates.length} scores, got ${scores?.length ?? 'none'}`
      )
    }

    const ranked = candidates.map((candidate, index) => ({
      ...candidate,
      rerankerScore: scores[index] ?? 0
    }))
    ranked.sort((a, b) => b.rerankerScore - a.rerankerScore)
    return ranked
  }
}
