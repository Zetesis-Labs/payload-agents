/**
 * Tool: get_post_summaries
 * Returns a lightweight list of posts: id, title, resolved categories.
 * No content. Paginable. Filterable by author or topic slug.
 *
 * Operates on collections with `kind: 'document'`. If the config has multiple
 * document-kind collections, the first one is used by default (callers can
 * pass an explicit `collection` to disambiguate).
 */

import { z } from 'zod'
import type { ResolvedTaxonomy, ToolContext } from '../context'
import type { ChunkCollectionConfig, McpAuthContext } from '../types'

export const getPostSummariesSchema = z.object({
  collection: z
    .string()
    .optional()
    .describe('Specific chunk collection name. Defaults to the first collection of kind="document".'),
  author_slug: z.string().optional().describe('Filter posts by author taxonomy slug.'),
  topic_slug: z.string().optional().describe('Filter posts by topic taxonomy slug.'),
  page: z.number().optional().describe('Page number. Default: 1.'),
  per_page: z.number().optional().describe('Results per page. Default: 50. Max: 100.')
})

export type GetPostSummariesInput = z.infer<typeof getPostSummariesSchema>

interface PostSummary {
  id: string
  title: string
  slug: string
  authors: Array<{ name: string; slug: string }>
  topics: Array<{ name: string; slug: string; breadcrumb: string }>
  has_topics: boolean
}

interface GroupedHitsResult {
  grouped_hits?: Array<{
    group_key: string[]
    found: number
    hits: Array<{ document: Record<string, unknown> }>
  }>
  found: number
}

interface ResolveOutcome {
  collection?: ChunkCollectionConfig
  error?: string
}

function resolveCategories(
  slugs: string[],
  taxonomyMap: Map<string, ResolvedTaxonomy>
): { authors: PostSummary['authors']; topics: PostSummary['topics'] } {
  const authors: PostSummary['authors'] = []
  const topics: PostSummary['topics'] = []

  for (const slug of slugs) {
    const entry = taxonomyMap.get(slug)
    if (!entry) continue
    if (entry.types.includes('author')) {
      authors.push({ name: entry.name, slug: entry.slug })
    } else if (entry.types.includes('topic')) {
      topics.push({ name: entry.name, slug: entry.slug, breadcrumb: entry.breadcrumb })
    }
  }

  return { authors, topics }
}

function resolveTargetCollection(input: GetPostSummariesInput, ctx: ToolContext): ResolveOutcome {
  if (input.collection) {
    const explicit = ctx.collections.byChunkName(input.collection)
    if (!explicit) {
      return {
        error: `Unknown collection: ${input.collection}. Available: ${ctx.collections.chunkNames.join(', ')}`
      }
    }
    return { collection: explicit }
  }
  const first = ctx.collections.documents[0]
  if (!first) {
    return {
      error:
        'No document-kind collection is configured. Mark at least one collection with kind: "document" to enable this tool.'
    }
  }
  return { collection: first }
}

function buildFilters(input: GetPostSummariesInput, tenantSlug: string | null): string[] {
  const filters: string[] = []
  if (tenantSlug) filters.push(`tenant:=${tenantSlug}`)
  if (input.author_slug) filters.push(`taxonomy_slugs:=${input.author_slug}`)
  if (input.topic_slug) filters.push(`taxonomy_slugs:=${input.topic_slug}`)
  return filters
}

function groupedHitsToPosts(grouped: GroupedHitsResult, taxonomyMap: Map<string, ResolvedTaxonomy>): PostSummary[] {
  if (!grouped.grouped_hits) return []
  const posts: PostSummary[] = []
  for (const group of grouped.grouped_hits) {
    const doc = group.hits[0]?.document
    if (!doc) continue
    const slugs = (doc.taxonomy_slugs as string[]) || []
    const { authors, topics } = resolveCategories(slugs, taxonomyMap)
    posts.push({
      id: String(doc.parent_doc_id || ''),
      title: String(doc.title || ''),
      slug: String(doc.slug || ''),
      authors,
      topics,
      has_topics: topics.length > 0
    })
  }
  return posts
}

export async function getPostSummaries(input: GetPostSummariesInput, ctx: ToolContext, auth: McpAuthContext | null) {
  const resolved = resolveTargetCollection(input, ctx)
  if (!resolved.collection) {
    return { error: resolved.error, posts: [], total: 0 }
  }
  const targetCollection = resolved.collection

  const tenantSlug = auth?.tenantSlug ?? null
  const taxonomyMap = await ctx.taxonomy.getTaxonomyMap()
  const perPage = Math.min(input.per_page ?? 50, 100)
  const page = input.page ?? 1

  const filters = buildFilters(input, tenantSlug)

  // Strategy: search chunks with * query, group by parent_doc_id to dedupe
  // into one entry per parent post. The first chunk of each group carries
  // the title/slug metadata.
  const result = await ctx.typesense
    .collections(targetCollection.chunkCollection)
    .documents()
    .search({
      q: '*',
      query_by: targetCollection.chunkSearchFields[0] || 'title',
      filter_by: filters.length > 0 ? filters.join(' && ') : undefined,
      group_by: 'parent_doc_id',
      group_limit: 1,
      per_page: perPage,
      page,
      include_fields: 'parent_doc_id,title,slug,taxonomy_slugs'
    })

  const grouped = result as unknown as GroupedHitsResult
  const posts = groupedHitsToPosts(grouped, taxonomyMap)
  const totalFound = grouped.found || 0

  return {
    posts,
    total: totalFound,
    page,
    per_page: perPage,
    total_pages: Math.ceil(totalFound / perPage),
    filters_applied: {
      collection: targetCollection.chunkCollection,
      author_slug: input.author_slug || null,
      topic_slug: input.topic_slug || null
    }
  }
}
