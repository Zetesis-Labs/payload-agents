/**
 * Tool/Resource: collection_stats
 * Returns statistics for all collections: document counts, taxonomy distribution.
 */

import type { ToolContext } from '../context'
import type { ChunkCollectionConfig, McpAuthContext } from '../types'

interface TaxonomyStat {
  slug: string
  name: string
  type: string
  breadcrumb: string
  count: number
}

interface CollectionStats {
  collection: string
  displayName: string
  total_documents: number
  taxonomy_distribution: TaxonomyStat[]
}

async function getStatsForCollection(
  ctx: ToolContext,
  collectionDef: ChunkCollectionConfig,
  tenantSlug: string | null
): Promise<CollectionStats> {
  const taxonomyMap = await ctx.taxonomy.getTaxonomyMap()

  try {
    const result = await ctx.typesense
      .collections(collectionDef.chunkCollection)
      .documents()
      .search({
        q: '*',
        query_by: collectionDef.chunkSearchFields[0] || 'title',
        facet_by: 'taxonomy_slugs',
        max_facet_values: 200,
        per_page: 0,
        ...(tenantSlug ? { filter_by: `tenant:=${tenantSlug}` } : {})
      })

    const facetCounts = result.facet_counts?.find(f => f.field_name === 'taxonomy_slugs')
    const distribution: TaxonomyStat[] = (facetCounts?.counts || []).map(c => {
      const entry = taxonomyMap.get(c.value)
      return {
        slug: c.value,
        name: entry?.name || c.value,
        type: entry?.types[0] || 'unknown',
        breadcrumb: entry?.breadcrumb || c.value,
        count: c.count
      }
    })

    // Sort: authors first, then topics, each by count desc
    distribution.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'author' ? -1 : 1
      return b.count - a.count
    })

    return {
      collection: collectionDef.chunkCollection,
      displayName: collectionDef.displayName,
      total_documents: result.found || 0,
      taxonomy_distribution: distribution
    }
  } catch (err) {
    console.error(`[mcp-typesense] Failed to get stats for ${collectionDef.chunkCollection}:`, err)
    return {
      collection: collectionDef.chunkCollection,
      displayName: collectionDef.displayName,
      total_documents: 0,
      taxonomy_distribution: []
    }
  }
}

export async function getCollectionStats(
  ctx: ToolContext,
  auth: McpAuthContext | null
): Promise<{ collections: CollectionStats[] }> {
  const tenantSlug = auth?.tenantSlug ?? null
  const results = await Promise.all(ctx.collections.chunks.map(c => getStatsForCollection(ctx, c, tenantSlug)))
  return { collections: results }
}
