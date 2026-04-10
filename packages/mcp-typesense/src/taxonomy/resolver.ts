/**
 * In-memory taxonomy resolver with TTL cache.
 *
 * NOTE: Taxonomies are intentionally treated as GLOBAL (not scoped by tenant).
 * A single cache serves all tenants. Consumers who need per-tenant taxonomies
 * should provide a custom TaxonomySource that baked the tenant into the fetch
 * and instantiate one server per tenant.
 */

import type { ResolvedTaxonomy, TaxonomyEnriched, TaxonomyResolver } from '../context'
import type { RawTaxonomyDoc, TaxonomyConfig } from '../types'
import { loadTaxonomyDocs } from './source'

const DEFAULT_TTL_MS = 5 * 60 * 1000

export function createTaxonomyResolver(config: TaxonomyConfig): TaxonomyResolver {
  const ttl = config.cacheTtlMs ?? DEFAULT_TTL_MS
  let cache: Map<string, ResolvedTaxonomy> | null = null
  let cacheTimestamp = 0
  let inflight: Promise<Map<string, ResolvedTaxonomy>> | null = null

  function buildCache(docs: RawTaxonomyDoc[]): Map<string, ResolvedTaxonomy> {
    const map = new Map<string, ResolvedTaxonomy>()
    for (const doc of docs) {
      map.set(doc.slug, {
        id: doc.id,
        name: doc.name,
        slug: doc.slug,
        types: doc.types ?? [],
        breadcrumb: doc.breadcrumb && doc.breadcrumb.length > 0 ? doc.breadcrumb : doc.name,
        parentSlug: doc.parentSlug ?? null
      })
    }
    return map
  }

  async function load(): Promise<Map<string, ResolvedTaxonomy>> {
    const now = Date.now()
    if (cache && now - cacheTimestamp < ttl) return cache
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const docs = await loadTaxonomyDocs(config.source)
        cache = buildCache(docs)
        cacheTimestamp = Date.now()
        return cache
      } catch (err) {
        console.error('[mcp-typesense] taxonomy reload failed:', err)
        if (cache) return cache
        throw err
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  return {
    async getTaxonomyMap() {
      return load()
    },
    async resolveSlugs(slugs: string[]): Promise<TaxonomyEnriched[]> {
      const map = await load()
      return slugs.map(slug => {
        const entry = map.get(slug)
        if (entry) {
          return {
            slug: entry.slug,
            name: entry.name,
            type: entry.types[0] ?? 'unknown',
            breadcrumb: entry.breadcrumb
          }
        }
        return { slug, name: slug, type: 'unknown', breadcrumb: slug }
      })
    },
    async getAll(): Promise<ResolvedTaxonomy[]> {
      const map = await load()
      return [...map.values()]
    }
  }
}
