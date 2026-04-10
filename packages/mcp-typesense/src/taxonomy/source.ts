/**
 * Taxonomy source adapters. Normalizes whatever the consumer provides into a
 * `RawTaxonomyDoc[]` that the resolver indexes.
 *
 * In Phase A we support:
 * - `payload-rest`: fetches `/api/{collection}` with pagination.
 * - `custom`: consumer-provided async function.
 */

import type { RawTaxonomyDoc, TaxonomySource } from '../types'

interface PayloadTaxonomyDoc {
  id: number | string
  name: string
  slug: string
  payload?: { types?: string[] } | null
  parent?: { id: number | string; slug?: string; name?: string } | number | string | null
  breadcrumbs?: Array<{ url?: string; label?: string }> | null
}

async function fetchFromPayload(baseUrl: string, collectionSlug: string): Promise<RawTaxonomyDoc[]> {
  const allDocs: RawTaxonomyDoc[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = `${baseUrl}/api/${collectionSlug}?limit=100&page=${page}&depth=1`
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' }
    })

    if (!res.ok) {
      throw new Error(`[mcp-typesense] taxonomy source error: ${res.status} ${res.statusText} (page ${page})`)
    }

    const data = (await res.json()) as { docs: PayloadTaxonomyDoc[]; totalPages: number }

    for (const doc of data.docs) {
      const parentSlug =
        typeof doc.parent === 'object' && doc.parent !== null && 'slug' in doc.parent ? (doc.parent.slug ?? null) : null
      const breadcrumb =
        doc.breadcrumbs
          ?.map(b => b.label)
          .filter((label): label is string => Boolean(label))
          .join(' → ') || doc.name
      allDocs.push({
        id: doc.id,
        name: doc.name,
        slug: doc.slug,
        types: doc.payload?.types ?? [],
        parentSlug,
        breadcrumb
      })
    }

    hasMore = page < data.totalPages
    page++
  }

  return allDocs
}

export async function loadTaxonomyDocs(source: TaxonomySource): Promise<RawTaxonomyDoc[]> {
  if (source.type === 'payload-rest') {
    return fetchFromPayload(source.baseUrl, source.collectionSlug ?? 'taxonomy')
  }
  // custom
  return source.fetch()
}
