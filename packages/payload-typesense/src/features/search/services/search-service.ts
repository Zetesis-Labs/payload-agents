import type { TableConfig } from '@zetesis/payload-indexer'
import type { Client } from 'typesense'
import { logger } from '../../../core/logging/logger'
import { searchCache } from '../../../shared/cache/cache'
import { DEFAULT_ALPHA, DEFAULT_K } from '../constants'
import { performTraditionalMultiCollectionSearch } from '../endpoints/handlers/executors/traditional-multi-collection-search'
import { processVectorSearchResults } from '../results/process-vector-results'
import type { CombinedSearchResult, UniversalSearchOptions } from '../types'
import { buildMultiCollectionVectorSearchParams } from '../vector/build-multi-collection-params'

export class SearchService {
  constructor(private typesenseClient: Client) {}

  async performSearch(
    query: string,
    targetCollections: Array<[string, TableConfig]>,
    options: UniversalSearchOptions
  ): Promise<CombinedSearchResult> {
    const cacheKey = `search:${query}:${JSON.stringify(options)}:${targetCollections.map(c => c[0]).join(',')}`
    const cachedResult = searchCache.get(query, cacheKey, options) as CombinedSearchResult | null
    if (cachedResult) return cachedResult

    const searchMode = options.mode || 'semantic'

    if (searchMode === 'simple') {
      return this.performTraditionalSearch(query, targetCollections, options)
    }

    // Vector search: Typesense embeds the query server-side. Tables without
    // an `autoEmbed` config are filtered out — they have no embedding field.
    const autoEmbedTargets = targetCollections.filter(([, config]) => Boolean(config.embedding?.autoEmbed))
    if (autoEmbedTargets.length === 0) {
      return this.performTraditionalSearch(query, targetCollections, options)
    }

    try {
      const results = await this.executeVectorSearch(query, autoEmbedTargets, options)
      searchCache.set(query, results, cacheKey, options)
      return results
    } catch (error) {
      logger.error('Vector search failed, falling back to traditional', error as Error)
      return this.performTraditionalSearch(query, targetCollections, options)
    }
  }

  private async performTraditionalSearch(
    query: string,
    targetCollections: Array<[string, TableConfig]>,
    options: UniversalSearchOptions
  ): Promise<CombinedSearchResult> {
    return performTraditionalMultiCollectionSearch(this.typesenseClient, targetCollections, query, options)
  }

  private async executeVectorSearch(
    query: string,
    targetCollections: Array<[string, TableConfig]>,
    options: UniversalSearchOptions
  ): Promise<CombinedSearchResult> {
    const searches = buildMultiCollectionVectorSearchParams(targetCollections, {
      query,
      k: Math.min(30, DEFAULT_K),
      hybrid: true,
      alpha: DEFAULT_ALPHA,
      page: options.page,
      per_page: options.per_page,
      ...(options.sort_by !== undefined && { sort_by: options.sort_by })
    })

    if (searches.length === 0) {
      return {
        collections: [],
        found: 0,
        hits: [],
        page: options.page,
        request_params: {
          per_page: options.per_page,
          query: query
        },
        search_cutoff: false,
        search_time_ms: 0
      }
    }

    const multiSearchResults = await this.typesenseClient.multiSearch.perform({
      searches
    })

    return processVectorSearchResults(multiSearchResults, targetCollections, {
      per_page: options.per_page,
      page: options.page,
      k: DEFAULT_K,
      query
    })
  }
}
