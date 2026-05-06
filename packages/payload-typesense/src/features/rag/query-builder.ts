/**
 * Query builder utilities for Typesense Conversational RAG.
 *
 * Every collection is expected to be auto-embedded; Typesense embeds the
 * `q` parameter server-side. The client never sends a precomputed vector.
 */

import type { TypesenseConnectionConfig } from '../../index'
import type { AdvancedSearchConfig, TypesenseQueryConfig } from '../../shared/index'

/**
 * Typesense search request object
 */
interface TypesenseSearchRequest {
  collection: string
  query_by: string
  vector_query: string
  exclude_fields: string
  filter_by?: string
  typo_tokens_threshold?: number
  num_typos?: number
  prefix?: boolean
  drop_tokens_threshold?: number
  enable_stemming?: boolean
}

/**
 * Advanced search parameters object
 */
interface AdvancedSearchParams {
  typo_tokens_threshold?: number
  num_typos?: number
  prefix?: boolean
  drop_tokens_threshold?: number
  enable_stemming?: boolean
}

/**
 * Build the Typesense conversational search URL with all necessary parameters
 */
export function buildConversationalUrl(
  config: { userMessage: string; chatId?: string },
  conversationModelId: string,
  typesenseConfig: TypesenseConnectionConfig
): URL {
  const protocol = typesenseConfig.nodes[0].protocol || 'http'
  const typesenseUrl = new URL(
    `${protocol}://${typesenseConfig.nodes[0].host}:${typesenseConfig.nodes[0].port}/multi_search`
  )

  typesenseUrl.searchParams.set('q', config.userMessage)
  typesenseUrl.searchParams.set('conversation', 'true')
  typesenseUrl.searchParams.set('conversation_model_id', conversationModelId)

  if (config.chatId) {
    typesenseUrl.searchParams.set('conversation_id', config.chatId)
  }

  typesenseUrl.searchParams.set('conversation_stream', 'true')

  return typesenseUrl
}

/**
 * Build multi-search requests for Typesense with hybrid search configuration
 */
export function buildMultiSearchRequests(config: TypesenseQueryConfig) {
  const {
    searchCollections,
    kResults = 10,
    advancedConfig = {},
    taxonomySlugs,
    requireTaxonomies = false
  } = config

  return searchCollections.map((collection: string) => {
    const request: TypesenseSearchRequest = {
      collection,
      query_by: 'embedding,chunk_text,title,headers',
      vector_query: `embedding:([], k:${kResults})`,
      exclude_fields: 'embedding',
      ...buildAdvancedSearchParams(advancedConfig)
    }

    const filters: string[] = []

    if (taxonomySlugs && taxonomySlugs.length > 0) {
      const taxFilter = taxonomySlugs.map((s: string) => `"${s}"`).join(',')
      filters.push(`taxonomy_slugs:[${taxFilter}]`)
    } else if (requireTaxonomies) {
      // Block global searches when taxonomies are required but none assigned
      filters.push('id:=__BLOCKED_NO_TAXONOMIES__')
    }

    if (filters.length > 0) {
      request.filter_by = filters.join(' && ')
    }

    return request
  })
}

/**
 * Build advanced search parameters from config.
 *
 * `prefix` is forced to `false`: Typesense rejects prefix search whenever
 * a remote embedder is in `query_by` (which is always the case here), so
 * any user-provided `prefix: true` would 400.
 */
function buildAdvancedSearchParams(config: AdvancedSearchConfig): AdvancedSearchParams {
  const params: AdvancedSearchParams = { prefix: false }

  if (config.typoTokensThreshold !== undefined) {
    params.typo_tokens_threshold = config.typoTokensThreshold
  }

  if (config.numTypos !== undefined) {
    params.num_typos = config.numTypos
  }

  if (config.dropTokensThreshold !== undefined) {
    params.drop_tokens_threshold = config.dropTokensThreshold
  }

  if (config.enableStemming !== undefined) {
    params.enable_stemming = config.enableStemming
  }

  return params
}

/**
 * Build the complete Typesense request body for multi-search
 */
export function buildMultiSearchRequestBody(config: TypesenseQueryConfig) {
  return {
    searches: buildMultiSearchRequests(config)
  }
}

/**
 * Build hybrid search parameters for combining semantic and keyword search
 */
export function buildHybridSearchParams(alpha = 0.9, rerankMatches = true, queryFields = 'chunk_text,title') {
  return {
    alpha,
    rerank_hybrid_matches: rerankMatches,
    query_fields: queryFields
  }
}
