/**
 * Tool: get_book_toc
 * Returns a hierarchical table of contents for one or all books.
 * Parses markdown headings from chapter content to build a real tree.
 * No heavy content is returned — only the structural skeleton.
 *
 * Requires a ContentFetcher (from `content` config). If no content source is
 * configured, this tool is not registered at all.
 */

import { z } from 'zod'
import type { ResolvedTaxonomy, ToolContext } from '../context'
import type { McpAuthContext, RawBookDoc } from '../types'

export const getBookTocSchema = z.object({
  id: z.union([z.number(), z.string()]).optional().describe('Specific book ID.'),
  slug: z.string().optional().describe('Specific book slug.'),
  author_slug: z.string().optional().describe('Filter books by author taxonomy slug.'),
  include_chapters: z
    .boolean()
    .optional()
    .describe(
      'Force-include expanded chapter TOCs even with no filter. Default: true when a filter is passed, false otherwise (index-only mode to save context).'
    )
})

export type GetBookTocInput = z.infer<typeof getBookTocSchema>

interface SectionNode {
  title: string
  children: SectionNode[]
}

/** Internal node with level for tree building */
interface InternalNode {
  level: number
  title: string
  children: InternalNode[]
}

interface ChapterToc {
  index: number
  title: string
  sections: SectionNode[]
}

interface BookIndexEntry {
  id: number | string
  title: string
  slug: string
  authors: Array<{ name: string; slug: string }>
  topics: Array<{ name: string; slug: string; breadcrumb: string }>
  chapter_count: number
}

interface BookTocEntry extends BookIndexEntry {
  chapters: ChapterToc[]
}

/**
 * Extract markdown headings from text and build a nested tree.
 * Handles #, ##, ###, ####, #####, ###### levels.
 */
function parseHeadingTree(markdown: string): SectionNode[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const headings: Array<{ level: number; title: string }> = []

  for (const match of markdown.matchAll(headingRegex)) {
    const levelStr = match[1]
    const rawTitle = match[2]
    if (!levelStr || rawTitle === undefined) continue
    headings.push({ level: levelStr.length, title: rawTitle.trim() })
  }

  if (headings.length === 0) return []

  // Build tree using a stack-based approach (internal nodes have level)
  const root: InternalNode[] = []
  const stack: Array<{ level: number; node: InternalNode }> = []

  for (const { level, title } of headings) {
    const node: InternalNode = { level, title, children: [] }

    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (!top || top.level < level) break
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    if (parent) {
      parent.node.children.push(node)
    } else {
      root.push(node)
    }

    stack.push({ level, node })
  }

  // Strip level from output — indentation already conveys depth
  const stripLevel = (nodes: InternalNode[]): SectionNode[] =>
    nodes.map(n => ({
      title: n.title,
      children: stripLevel(n.children)
    }))

  return stripLevel(root)
}

interface ResolvedCategories {
  authors: Array<{ name: string; slug: string }>
  topics: Array<{ name: string; slug: string; breadcrumb: string }>
}

function resolveBookCategories(book: RawBookDoc, taxonomyMap: Map<string, ResolvedTaxonomy>): ResolvedCategories {
  const categoryIds = (book.categories || []).map(c => {
    if (typeof c === 'object' && c !== null) {
      return c.slug ?? String(c.id)
    }
    return String(c)
  })
  const authors: ResolvedCategories['authors'] = []
  const topics: ResolvedCategories['topics'] = []

  for (const catRef of categoryIds) {
    const entry = taxonomyMap.get(catRef)
    if (!entry) continue
    if (entry.types.includes('author')) {
      authors.push({ name: entry.name, slug: entry.slug })
    } else if (entry.types.includes('topic')) {
      topics.push({ name: entry.name, slug: entry.slug, breadcrumb: entry.breadcrumb })
    }
  }

  return { authors, topics }
}

function buildChapterToc(book: RawBookDoc): ChapterToc[] {
  return (book.chapters || []).map((ch, i) => ({
    index: i,
    title: ch.title || `Chapter ${i + 1}`,
    sections: ch.content ? parseHeadingTree(ch.content) : []
  }))
}

export async function getBookToc(input: GetBookTocInput, ctx: ToolContext, auth: McpAuthContext | null) {
  if (!ctx.content) {
    return {
      error: 'No content source configured. Add a `content` block to the server config to enable this tool.',
      total: 0,
      books: []
    }
  }

  const tenantSlug = auth?.tenantSlug ?? null
  const books = await ctx.content.fetchBooks({ id: input.id, slug: input.slug, tenantSlug })
  const taxonomyMap = await ctx.taxonomy.getTaxonomyMap()

  // Whether a filter was passed by the caller
  const hasFilter = input.id !== undefined || input.slug !== undefined || input.author_slug !== undefined
  const includeChapters = input.include_chapters ?? hasFilter

  const indexEntries: BookIndexEntry[] = []
  const fullEntries: BookTocEntry[] = []

  for (const book of books) {
    const { authors, topics } = resolveBookCategories(book, taxonomyMap)

    if (input.author_slug && !authors.some(a => a.slug === input.author_slug)) {
      continue
    }

    const base: BookIndexEntry = {
      id: book.id,
      title: book.title,
      slug: book.slug,
      authors,
      topics,
      chapter_count: (book.chapters || []).length
    }

    if (includeChapters) {
      fullEntries.push({ ...base, chapters: buildChapterToc(book) })
    } else {
      indexEntries.push(base)
    }
  }

  if (includeChapters) {
    return {
      total: fullEntries.length,
      mode: 'full' as const,
      books: fullEntries
    }
  }
  return {
    total: indexEntries.length,
    mode: 'index' as const,
    note: 'Index mode: chapters omitted. Pass a filter (id, slug, author_slug) or include_chapters: true to expand.',
    books: indexEntries
  }
}
