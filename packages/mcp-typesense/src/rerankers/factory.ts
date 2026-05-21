/**
 * Factory that maps a reranker kind (the string stored in a SearchProfile)
 * to a concrete Reranker closure. Consumers configure the available
 * backends once and then resolve a Reranker per request by kind.
 *
 * Unknown kinds fall back to the no-op reranker so a misconfigured
 * profile degrades gracefully (search still returns results, ordering
 * just isn't improved).
 */

import { createDeepInfraReranker, type DeepInfraRerankerConfig } from './deep-infra'
import { noopReranker } from './noop'
import type { Reranker } from './types'

export interface RerankerFactoryConfig {
  /**
   * DeepInfra credentials. Provide an apiKey to enable the `deepinfra`
   * provider. The model identifier is supplied per-request from the
   * SearchProfile. If omitted, `deepinfra` falls back to no-op.
   */
  deepInfra?: DeepInfraRerankerConfig

  /**
   * Custom reranker registrations keyed by kind. Useful for `jina` (direct),
   * `tei` (self-hosted), or any consumer-specific provider. Takes precedence
   * over the built-in resolution for the same key.
   */
  custom?: Record<string, (model: string) => Reranker>
}

export type CreateRerankerInput = {
  /** Reranker provider as stored on the SearchProfile (`none`, `deepinfra`, ...). */
  kind: string | null | undefined
  /** Model identifier within the provider (e.g. `BAAI/bge-reranker-v2-m3`). */
  model?: string | null
}

export function createRerankerFactory(factoryConfig: RerankerFactoryConfig = {}) {
  const cache = new Map<string, Reranker>()

  return function createReranker({ kind, model }: CreateRerankerInput): Reranker {
    if (!kind || kind === 'none') return noopReranker
    if (!model) return noopReranker

    const cacheKey = `${kind}::${model}`
    const cached = cache.get(cacheKey)
    if (cached) return cached

    const customBuilder = factoryConfig.custom?.[kind]
    if (customBuilder) {
      const reranker = customBuilder(model)
      cache.set(cacheKey, reranker)
      return reranker
    }

    const reranker = resolveBuiltIn(kind, model, factoryConfig)
    cache.set(cacheKey, reranker)
    return reranker
  }
}

function resolveBuiltIn(kind: string, model: string, factoryConfig: RerankerFactoryConfig): Reranker {
  switch (kind) {
    case 'deepinfra':
      if (!factoryConfig.deepInfra?.apiKey) return noopReranker
      return createDeepInfraReranker(model, factoryConfig.deepInfra)
    default:
      return noopReranker
  }
}
