import type { TableConfig } from '@zetesis/payload-indexer'
import type { TypesenseFieldMapping } from '../../../adapter/types'
import type { BuildMultiCollectionVectorSearchParamsOptions } from '../types'
import { buildVectorSearchParams } from './build-params'

/**
 * Builds multi-collection vector search parameters. Every target collection
 * must be auto-embedded — Typesense embeds the query server-side per
 * collection's declared model.
 */
export const buildMultiCollectionVectorSearchParams = (
  enabledCollections: Array<[string, TableConfig]>,
  options: BuildMultiCollectionVectorSearchParamsOptions
): Array<Record<string, unknown>> => {
  const { query, k, hybrid, alpha, page, per_page, filter_by, sort_by } = options

  return enabledCollections.map(([collectionName, config]) => {
    let searchFields: string[] | undefined
    if (config) {
      const fields = config.fields as TypesenseFieldMapping[]
      const extracted = fields
        .filter(f => f.index !== false && (f.type === 'string' || f.type === 'string[]'))
        .map(f => f.name)
      if (extracted.length > 0) {
        searchFields = extracted
      }
    }

    const collectionSearchParams = buildVectorSearchParams({
      ...(query !== undefined && { query }),
      ...(k !== undefined && { k }),
      ...(hybrid !== undefined && { hybrid }),
      ...(alpha !== undefined && { alpha }),
      ...(page !== undefined && { page }),
      ...(per_page !== undefined && { per_page }),
      ...(sort_by !== undefined && { sort_by }),
      ...(searchFields !== undefined && { searchFields })
    })

    return {
      collection: collectionName,
      ...collectionSearchParams,
      _filter_by: filter_by
    }
  })
}
