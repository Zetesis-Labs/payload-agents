import { DEFAULT_ALPHA, DEFAULT_K, DEFAULT_PAGE, DEFAULT_PER_PAGE, DEFAULT_SEARCH_FIELDS } from '../constants'
import type { BuildVectorSearchParamsOptions } from '../types'

/**
 * Builds vector search parameters for a single collection.
 *
 * Two modes:
 * - manual: caller supplies `searchVector` (precomputed embedding of `query`).
 *   `vector_query` carries the raw float array.
 * - autoEmbed: caller passes `searchVector: []` and `autoEmbed: true`.
 *   `vector_query: '([], k:N)'` tells Typesense to embed the `q` text using
 *   the model declared in the collection schema.
 */
export const buildVectorSearchParams = (
  searchVector: number[],
  options: BuildVectorSearchParamsOptions
): Record<string, unknown> => {
  const {
    query,
    k = DEFAULT_K,
    hybrid = false,
    alpha = DEFAULT_ALPHA,
    page = DEFAULT_PAGE,
    per_page = DEFAULT_PER_PAGE,
    filter_by,
    sort_by,
    searchFields,
    autoEmbed = false
  } = options

  const vectorPayload = autoEmbed ? '[]' : `[${searchVector.join(',')}]`

  const searchParams: Record<string, unknown> = {
    // Pure vector mode without auto-embed: the wildcard q is required by
    // Typesense. With autoEmbed the q text drives the embedding, so we must
    // pass the actual user query.
    q: autoEmbed && query ? query : '*',
    vector_query: `embedding:(${vectorPayload}, k:${k})`,
    per_page,
    page,
    exclude_fields: 'embedding'
  }

  // When autoEmbed is true and we have a query, query_by must include the
  // embedding field so Typesense knows to embed the q. We can keep keyword
  // hybrid by adding text fields too.
  if (autoEmbed && query) {
    const fields = searchFields?.length ? searchFields : DEFAULT_SEARCH_FIELDS
    searchParams.query_by = hybrid ? [...fields, 'embedding'].join(',') : 'embedding'
    if (hybrid) {
      searchParams.vector_query = `embedding:(${vectorPayload}, k:${k}, alpha:${alpha})`
    }
  } else if (hybrid && query) {
    // Manual hybrid: traditional q for keyword, raw vector for semantic.
    searchParams.q = query
    searchParams.query_by = searchFields?.join(',') || DEFAULT_SEARCH_FIELDS.join(',')
    searchParams.vector_query = `embedding:(${vectorPayload}, k:${k}, alpha:${alpha})`
  }

  // Add filters if provided
  if (filter_by) {
    searchParams.filter_by = filter_by
  }

  // Add sorting if provided
  if (sort_by) {
    searchParams.sort_by = sort_by
  }

  return searchParams
}
