import { DEFAULT_ALPHA, DEFAULT_K, DEFAULT_PAGE, DEFAULT_PER_PAGE, DEFAULT_SEARCH_FIELDS } from '../constants'
import type { BuildVectorSearchParamsOptions } from '../types'

/**
 * Builds vector search parameters for a single auto-embedded collection.
 *
 * Typesense embeds the `q` parameter server-side using the model declared
 * in the collection schema. The `vector_query: '([], k:N)'` syntax tells
 * Typesense to use the embedded `q` as the search vector.
 */
export const buildVectorSearchParams = (options: BuildVectorSearchParamsOptions): Record<string, unknown> => {
  const {
    query,
    k = DEFAULT_K,
    hybrid = false,
    alpha = DEFAULT_ALPHA,
    page = DEFAULT_PAGE,
    per_page = DEFAULT_PER_PAGE,
    filter_by,
    sort_by,
    searchFields
  } = options

  const fields = searchFields?.length ? searchFields : DEFAULT_SEARCH_FIELDS

  const searchParams: Record<string, unknown> = {
    q: query ?? '*',
    query_by: hybrid ? [...fields, 'embedding'].join(',') : 'embedding',
    vector_query: hybrid ? `embedding:([], k:${k}, alpha:${alpha})` : `embedding:([], k:${k})`,
    per_page,
    page,
    exclude_fields: 'embedding',
    // Typesense rejects prefix search when a remote embedder is involved,
    // which is always the case under autoEmbed.
    prefix: false
  }

  if (filter_by) {
    searchParams.filter_by = filter_by
  }

  if (sort_by) {
    searchParams.sort_by = sort_by
  }

  return searchParams
}
