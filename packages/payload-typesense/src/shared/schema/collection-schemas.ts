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

interface EmbeddingFieldOptions {
  optional: boolean
  /** Required only when `autoEmbed` is undefined — Typesense infers it from the model otherwise. */
  dimensions?: number
  autoEmbed?: AutoEmbedConfig
}

/**
 * Build the `embedding` field for the schema. Two modes:
 * - manual: caller computes the vector and uploads it; field declares `num_dim`.
 * - autoEmbed: Typesense generates the vector on every upsert/search using
 *   the declared `embed` block. Dimensions are inferred from the model and
 *   must NOT be specified.
 */
const buildEmbeddingField = (options: EmbeddingFieldOptions): TypesenseFieldSchema => {
  const { optional, dimensions, autoEmbed } = options
  const base = { name: 'embedding', type: 'float[]' as const, ...(optional && { optional: true }) }

  if (autoEmbed) {
    return {
      ...base,
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

  if (dimensions === undefined) {
    throw new Error('Cannot build embedding field without dimensions or autoEmbed configuration')
  }
  return { ...base, num_dim: dimensions }
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
  { name: 'parent_doc_id', type: 'string' as const, facet: true }, // Required for chunks
  { name: 'chunk_index', type: 'int32' as const },
  { name: 'chunk_text', type: 'string' as const }, // The chunk content
  { name: 'is_chunk', type: 'bool' as const }, // Always true for chunks
  { name: 'headers', type: 'string[]' as const, facet: true, optional: true }, // Hierarchical header metadata
  { name: 'content_hash', type: 'string' as const, optional: true } // SHA-256 of source text for change detection
]

export interface CollectionSchemaEmbeddingOptions {
  dimensions?: number
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

  // Get user-defined field names to avoid duplicates
  const userFieldNames = new Set([...fields.map(f => f.name), ...getChunkFields().map(f => f.name)])

  // Filter base fields to exclude any that are already defined by user or chunk fields
  const baseFields = getBaseFields().filter(f => !userFieldNames.has(f.name))

  return {
    name: collectionSlug,
    fields: [...baseFields, ...getChunkFields(), ...fields, buildEmbeddingField({ optional: false, ...embedding })]
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

  // Get user-defined field names to avoid duplicates
  const userFieldNames = new Set(mappedFields.map(f => f.name))

  // Filter base fields to exclude any that are already defined by user
  const baseFields = getBaseFields().filter(f => !userFieldNames.has(f.name))

  return {
    name: collectionSlug,
    fields: [
      ...baseFields,
      ...mappedFields,
      buildEmbeddingField({ optional: true, ...embedding }),
      { name: 'content_hash', type: 'string' as const, optional: true }
    ]
  }
}
