import type { IndexableCollectionConfig } from '@zetesis/payload-indexer'
import { transformLexicalToMarkdown } from '@zetesis/payload-indexer'
import type { TypesenseAutoEmbedConfig, TypesenseFieldMapping } from '@zetesis/payload-typesense'
import { createDynamicContentTransform, transformCategories } from './transforms'

const postsAutoEmbed: TypesenseAutoEmbedConfig = {
  from: ['chunk_text'],
  modelConfig: {
    modelName: 'openai/text-embedding-3-small',
    apiKey: process.env.OPENAI_API_KEY as string
  }
}

export const collections: IndexableCollectionConfig<TypesenseFieldMapping> = {
  posts: [
    {
      enabled: true,
      tableName: 'posts_chunk',
      displayName: 'Posts (Chunked)',
      syncDepth: 1,
      embedding: {
        fields: [{ field: 'content', transform: createDynamicContentTransform() }],
        chunking: { strategy: 'markdown', size: 2000, overlap: 300 },
        autoEmbed: postsAutoEmbed
      },
      fields: [
        { name: 'title', type: 'string' },
        { name: 'slug', type: 'string', index: true },
        { name: 'publishedAt', type: 'int64', index: true, optional: true },
        {
          name: 'taxonomy_slugs',
          type: 'string[]',
          facet: true,
          optional: true,
          transform: transformCategories,
          payloadField: 'categories'
        }
      ]
    },
    {
      enabled: true,
      tableName: 'posts',
      displayName: 'Posts',
      syncDepth: 1,
      fields: [
        { name: 'title', type: 'string' },
        { name: 'slug', type: 'string', index: true },
        { name: 'publishedAt', type: 'int64', index: true, optional: true },
        {
          name: 'content',
          type: 'string',
          optional: true,
          transform: transformLexicalToMarkdown
        },
        {
          name: 'taxonomy_slugs',
          type: 'string[]',
          facet: true,
          optional: true,
          transform: transformCategories,
          payloadField: 'categories'
        }
      ]
    }
  ]
}

export const getTableConfig = (collectionSlug: string) => {
  const configs = collections[collectionSlug]
  if (!configs || configs.length === 0) return null
  return configs[0]
}
