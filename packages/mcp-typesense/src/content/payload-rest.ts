/**
 * Content fetcher. Used by `get_book_toc` to pull parent documents (books with
 * chapter markdown) from the consumer's CMS.
 *
 * Supports two source types:
 * - `payload-rest`: fetches from Payload REST endpoints.
 * - `custom`: consumer-provided fetcher.
 */

import type { ContentFetcher } from '../context'
import type { ContentConfig, FetchBooksParams, RawBookDoc } from '../types'

interface PayloadBooksResponse {
  docs: RawBookDoc[]
  totalPages: number
}

async function fetchBooksFromPayload(
  baseUrl: string,
  booksSlug: string,
  params: FetchBooksParams
): Promise<RawBookDoc[]> {
  if (params.id !== undefined) {
    const url = `${baseUrl}/api/${booksSlug}/${params.id}?depth=1`
    const res = await fetch(url)
    if (!res.ok) return []
    const doc = (await res.json()) as RawBookDoc
    return [doc]
  }

  const searchParams = new URLSearchParams({ limit: '200', depth: '1' })
  const whereClauses: Record<string, unknown> = {}
  if (params.slug) {
    whereClauses.slug = { equals: params.slug }
  }
  if (params.tenantSlug) {
    whereClauses['tenant.slug'] = { equals: params.tenantSlug }
  }
  if (Object.keys(whereClauses).length > 0) {
    searchParams.set('where', JSON.stringify(whereClauses))
  }

  const allDocs: RawBookDoc[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    searchParams.set('page', String(page))
    const res = await fetch(`${baseUrl}/api/${booksSlug}?${searchParams.toString()}`)
    if (!res.ok) break
    const data = (await res.json()) as PayloadBooksResponse
    allDocs.push(...data.docs)
    hasMore = page < data.totalPages
    page++
  }

  return allDocs
}

export function createContentFetcher(config: ContentConfig): ContentFetcher {
  const source = config.source

  if (source.type === 'payload-rest') {
    const baseUrl = source.baseUrl
    const booksSlug = source.collections?.books ?? 'books'
    return {
      fetchBooks: params => fetchBooksFromPayload(baseUrl, booksSlug, params)
    }
  }

  // custom
  return {
    fetchBooks: async params => {
      if (!source.fetchBooks) return []
      return source.fetchBooks(params)
    }
  }
}
