import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { transformLexicalToMarkdown } from '@zetesis/payload-indexer'
import { composeTextTransforms } from './text-transforms'

export const transformCategories = async (categories?: (number | Record<string, unknown>)[]): Promise<string[]> => {
  if (!categories || categories.length === 0) return []

  const slugs: string[] = []

  for (const cat of categories) {
    if (!cat || typeof cat !== 'object') continue
    const record = cat as Record<string, unknown>

    if (Array.isArray(record.breadcrumbs)) {
      const breadcrumbs = record.breadcrumbs as { url?: string }[]
      const lastBreadcrumb = [...breadcrumbs]
        .reverse()
        .find(b => b && typeof b === 'object' && 'url' in b && typeof b.url === 'string')
      if (lastBreadcrumb && typeof lastBreadcrumb.url === 'string') {
        slugs.push(...lastBreadcrumb.url.split('/').filter(Boolean))
        continue
      }
    }

    if (typeof record.slug === 'string' && record.slug.length > 0) {
      slugs.push(record.slug)
    }
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
