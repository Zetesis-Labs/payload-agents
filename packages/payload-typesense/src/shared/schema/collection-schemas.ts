import type { AutoEmbedConfig, TableConfig } from '@zetesis/payload-indexer'
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections'
import type { TypesenseFieldMapping } from '../../adapter/types'

/**
 * Field schema definitions for Typesense collections
 */

/**
 * Type for Typesense collection field schema
 * Extracted from CollectionCreateSchema to ensure type compatibility
 */
type TypesenseFieldSchema = NonNullable<CollectionCreateSchema['fields']>[number]

/**
 * Base fields that every collection should have
 */
const getBaseFields = () => [
  { name: 'id', type: 'string' as const },
  { name: 'slug', type: 'string' as const },
  { name: 'createdAt', type: 'int64' as const },
  { name: 'updatedAt', type: 'int64' as const }
]

interface AutoEmbedFieldOptions {
  optional: boolean
  autoEmbed: AutoEmbedConfig
}

/**
 * Build the `embedding` field for the schema. Typesense generates the
 * vector on every upsert/search using the declared `embed` block.
 */
const buildEmbeddingField = (options: AutoEmbedFieldOptions): TypesenseFieldSchema => {
  const { optional, autoEmbed } = options

  return {
    name: 'embedding',
    type: 'float[]' as const,
    ...(optional && { optional: true }),
    embed: {
      from: autoEmbed.from,
      model_config: {
        model_name: autoEmbed.modelConfig.modelName,
        ...(autoEmbed.modelConfig.apiKey !== undefined && { api_key: autoEmbed.modelConfig.apiKey }),
        ...(autoEmbed.modelConfig.accessToken !== undefined && {
          access_token: autoEmbed.modelConfig.accessToken
        }),
        ...(autoEmbed.modelConfig.clientId !== undefined && { client_id: autoEmbed.modelConfig.clientId }),
        ...(autoEmbed.modelConfig.clientSecret !== undefined && {
          client_secret: autoEmbed.modelConfig.clientSecret
        }),
        ...(autoEmbed.modelConfig.projectId !== undefined && { project_id: autoEmbed.modelConfig.projectId }),
        ...(autoEmbed.modelConfig.refreshToken !== undefined && {
          refresh_token: autoEmbed.modelConfig.refreshToken
        }),
        ...(autoEmbed.modelConfig.url !== undefined && { url: autoEmbed.modelConfig.url }),
        ...(autoEmbed.modelConfig.indexingPrefix !== undefined && {
          indexing_prefix: autoEmbed.modelConfig.indexingPrefix
        }),
        ...(autoEmbed.modelConfig.queryPrefix !== undefined && {
          query_prefix: autoEmbed.modelConfig.queryPrefix
        })
      }
    }
  } as TypesenseFieldSchema
}

/**
 * Maps TypesenseFieldMapping to TypesenseFieldSchema
 */
const mapFieldMappingsToSchema = (fields: TypesenseFieldMapping[]): TypesenseFieldSchema[] => {
  return fields.map(field => ({
    name: field.name,
    type: field.type === 'auto' ? 'string' : field.type,
    facet: field.facet,
    index: field.index,
    optional: field.optional
  }))
}

/**
 * Gets chunk-specific fields for chunk collections
 */
const getChunkFields = () => [
  { name: 'parent_doc_id', type: 'string' as const, facet: true },
  { name: 'chunk_index', type: 'int32' as const },
  { name: 'chunk_text', type: 'string' as const },
  { name: 'is_chunk', type: 'bool' as const },
  { name: 'headers', type: 'string[]' as const, facet: true, optional: true },
  { name: 'content_hash', type: 'string' as const, optional: true }
]

export interface CollectionSchemaEmbeddingOptions {
  /** Backend auto-embed config. Omit to build a schema without an embedding field. */
  autoEmbed?: AutoEmbedConfig
}

/**
 * Creates a complete schema for a chunk collection
 */
export const getChunkCollectionSchema = (
  collectionSlug: string,
  tableConfig: TableConfig<TypesenseFieldMapping>,
  embedding: CollectionSchemaEmbeddingOptions
) => {
  const fields = tableConfig.fields ? mapFieldMappingsToSchema(tableConfig.fields) : []

  const userFieldNames = new Set([...fields.map(f => f.name), ...getChunkFields().map(f => f.name)])
  const baseFields = getBaseFields().filter(f => !userFieldNames.has(f.name))

  return {
    name: collectionSlug,
    fields: [
      ...baseFields,
      ...getChunkFields(),
      ...fields,
      ...(embedding.autoEmbed ? [buildEmbeddingField({ optional: false, autoEmbed: embedding.autoEmbed })] : [])
    ]
  }
}

/**
 * Creates a complete schema for a full document collection
 */
export const getFullDocumentCollectionSchema = (
  collectionSlug: string,
  tableConfig: TableConfig<TypesenseFieldMapping>,
  embedding: CollectionSchemaEmbeddingOptions
) => {
  const mappedFields = mapFieldMappingsToSchema(tableConfig.fields)

  const userFieldNames = new Set(mappedFields.map(f => f.name))
  const baseFields = getBaseFields().filter(f => !userFieldNames.has(f.name))

  return {
    name: collectionSlug,
    fields: [
      ...baseFields,
      ...mappedFields,
      ...(embedding.autoEmbed ? [buildEmbeddingField({ optional: true, autoEmbed: embedding.autoEmbed })] : []),
      { name: 'content_hash', type: 'string' as const, optional: true }
    ]
  }
}
