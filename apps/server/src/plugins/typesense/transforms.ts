import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { transformLexicalToMarkdown } from '@zetesis/payload-indexer'
import { composeTextTransforms } from './text-transforms'

/**
 * Transform categories relationship to taxonomy slugs array.
 * Extracts the deepest slug from each category via its last breadcrumb.
 */
export const transformCategories = async (categories?: (number | Record<string, unknown>)[]): Promise<string[]> => {
  if (!categories || categories.length === 0) return []

  const slugs: string[] = []

  for (const cat of categories) {
    if (!cat || typeof cat !== 'object' || !Array.isArray((cat as Record<string, unknown>).breadcrumbs)) continue
    const breadcrumbs = (cat as Record<string, unknown>).breadcrumbs as { url?: string }[]
    const lastBreadcrumb = [...breadcrumbs]
      .reverse()
      .find(b => b && typeof b === 'object' && 'url' in b && typeof b.url === 'string')
    if (!lastBreadcrumb || typeof lastBreadcrumb.url !== 'string') continue
    const parts = lastBreadcrumb.url.split('/').filter(Boolean)
    slugs.push(...parts)
  }

  return [...new Set(slugs)]
}

/**
 * Creates a dynamic content transform that:
 * 1. Converts Lexical -> Markdown
 * 2. Applies text transforms selected on the document (text_transforms field)
 */
export const createDynamicContentTransform = () => {
  return async (value: unknown, doc?: Record<string, unknown>): Promise<string> => {
    const markdown = await transformLexicalToMarkdown(value as SerializedEditorState)

    const slugs = (doc?.text_transforms as string[]) || []
    if (slugs.length === 0) return markdown

    const pipeline = composeTextTransforms(slugs)
    return pipeline(markdown)
  }
}
