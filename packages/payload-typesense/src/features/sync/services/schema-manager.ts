import type { TableConfig } from '@zetesis/payload-indexer'
import type { Client } from 'typesense'
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections'
import { isTypesense404, type TypesenseFieldMapping } from '../../../adapter/types'
import type { ModularPluginConfig } from '../../../core/config/types'
import { logger } from '../../../core/logging/logger'
import { getTypesenseCollectionName } from '../../../core/utils/naming'
import {
  type CollectionSchemaEmbeddingOptions,
  getChunkCollectionSchema,
  getFullDocumentCollectionSchema
} from '../../../shared/schema/collection-schemas'

export class SchemaManager {
  constructor(
    private client: Client,
    private config: ModularPluginConfig
  ) {}

  /**
   * Synchronizes all configured collections with Typesense
   */
  async syncCollections(): Promise<void> {
    if (!this.config.collections) return

    logger.info('Starting schema synchronization...')

    for (const [collectionSlug, tableConfigs] of Object.entries(this.config.collections)) {
      if (!tableConfigs) continue

      for (const tableConfig of tableConfigs) {
        if (!tableConfig.enabled) continue

        const embedding = this.resolveEmbeddingOptions(collectionSlug, tableConfig)
        if (!embedding) continue

        await this.syncTable(collectionSlug, tableConfig, embedding)
      }
    }

    logger.info('Schema synchronization completed.')
  }

  /**
   * Picks the embedding config for a single table. Only `autoEmbed` is
   * supported — if the table declares no `embedding`, the schema is built
   * without an embedding field at all (skip vector search for that table).
   */
  private resolveEmbeddingOptions(
    collectionSlug: string,
    tableConfig: TableConfig<TypesenseFieldMapping>
  ): CollectionSchemaEmbeddingOptions | null {
    if (tableConfig.embedding?.autoEmbed) {
      return { autoEmbed: tableConfig.embedding.autoEmbed }
    }

    if (tableConfig.embedding) {
      logger.warn(
        `Table "${tableConfig.tableName ?? collectionSlug}" declares \`embedding\` without \`autoEmbed\`; ` +
          'autoEmbed is the only supported embedding mode. Skipping schema sync.'
      )
      return null
    }

    return { autoEmbed: undefined }
  }

  /**
   * Syncs a single table configuration
   */
  private async syncTable(
    collectionSlug: string,
    tableConfig: TableConfig<TypesenseFieldMapping>,
    embedding: CollectionSchemaEmbeddingOptions
  ): Promise<void> {
    const tableName = getTypesenseCollectionName(collectionSlug, tableConfig)

    let targetSchema: CollectionCreateSchema

    if (tableConfig.embedding?.chunking) {
      targetSchema = getChunkCollectionSchema(tableName, tableConfig, embedding)
    } else {
      targetSchema = getFullDocumentCollectionSchema(tableName, tableConfig, embedding)
    }

    try {
      const collection = await this.client.collections(tableName).retrieve()

      // Typesense only allows adding fields, not modifying/deleting (requires reindex)
      await this.updateCollectionSchema(tableName, collection, targetSchema)
    } catch (error: unknown) {
      if (isTypesense404(error)) {
        logger.info(`Creating collection: ${tableName}`)
        await this.client.collections().create(targetSchema)
      } else {
        logger.error(`Error checking collection ${tableName}`, error as Error)
        throw error
      }
    }
  }

  private async updateCollectionSchema(
    tableName: string,
    currentSchema: { fields?: Array<{ name: string }> },
    targetSchema: CollectionCreateSchema
  ): Promise<void> {
    if (!currentSchema || !currentSchema.fields) return

    const fields = currentSchema.fields
    const currentFields = new Set(fields.map(f => f.name))
    const newFields = targetSchema.fields?.filter(f => !currentFields.has(f.name) && f.name !== 'id') || []

    if (newFields.length > 0) {
      logger.info(`Updating collection ${tableName} with ${newFields.length} new fields`, {
        fields: newFields.map(f => f.name)
      })

      try {
        await this.client.collections(tableName).update({
          fields: newFields
        })
      } catch (error) {
        logger.error(`Failed to update collection ${tableName}`, error as Error)
      }
    }
  }
}
