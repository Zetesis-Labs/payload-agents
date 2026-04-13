/**
 * Source extraction from TOON-encoded MCP tool results.
 *
 * Used by both the SSE stream translator and the session history loader
 * to extract source references from Typesense search results.
 */

import { decode as decodeToon } from '@toon-format/toon'
import type { Source } from '../types'

/**
 * Extract source references from a TOON-encoded tool result string.
 * Returns an empty array if the result is not a valid search result.
 */
export function extractSources(result: unknown): Source[] {
  if (typeof result !== 'string' || !result) return []
  const out: Source[] = []
  try {
    const data = decodeToon(result) as Record<string, unknown>
    const hits = Array.isArray(data) ? data : (data.hits as unknown[])
    if (!Array.isArray(hits)) return out
    for (const item of hits) {
      if (item && typeof item === 'object' && 'chunk_id' in item) {
        const it = item as Record<string, string>
        out.push({
          id: it.chunk_id || '',
          title: it.title || it.document_title || '',
          slug: it.slug || it.document_slug || '',
          type: (it.collection || 'posts_chunk').replace(/_chunk$/, '')
        })
      }
    }
  } catch {
    // TOON parse failed — result might not be a search result
  }
  return out
}

/**
 * Deduplicate sources by id, preserving order.
 */
export function dedupSources(sources: Source[]): Source[] {
  const seen = new Set<string>()
  return sources.filter(s => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })
}
