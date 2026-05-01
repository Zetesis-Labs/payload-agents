/**
 * Document syncer - syncs Payload documents to the index using the adapter
 */

import type { IndexDocument, IndexerAdapter } from '../../adapter/types'
import { logger } from '../../core/logging/logger'
import { recordDeletion, recordEmbeddingFailure, recordSyncSuccess } from '../../core/metrics/sync-metrics'
import { formatChunkWithHeaders } from '../../core/utils/chunk-format-utils'
import { computeContentHash } from '../../core/utils/content-hash'
import { buildHeaderHierarchy } from '../../core/utils/header-utils'
import { mapPayloadDocumentToIndex } from '../../document/field-mapper'
import type { EmbeddingFailureBehavior, PayloadDocument, TableConfig } from '../../document/types'
import { chunkMarkdown, chunkText } from '../../embedding/chunking/strategies'
import type { TextChunk } from '../../embedding/chunking/types'
import type { EmbeddingService } from '../../embedding/types'
import { getIndexCollectionName } from '../utils/naming'

export interface SyncOptions {
  forceReindex?: boolean
}

/**
 * Syncs a Payload document to the index
 * Uses Strategy pattern to handle both chunked and full document approaches
 *
 * @param adapter - The indexer adapter to use
 * @param collectionSlug - The Payload collection slug
 * @param doc - The document to sync
 * @param operation - The operation being performed
 * @param tableConfig - The table configuration
 * @param embeddingService - Optional embedding service
 */
export const syncDocumentToIndex = async (
  adapter: IndexerAdapter,
  collectionSlug: string,
  doc: PayloadDocument,
  operation: 'create' | 'update',
  tableConfig: TableConfig,
  embeddingService?: EmbeddingService,
  options?: SyncOptions
) => {
  const tableName = getIndexCollectionName(collectionSlug, tableConfig)

  logger.debug('Syncing document to index', {
    documentId: doc.id,
    collection: collectionSlug,
    tableName,
    operation
  })

  const syncer = new DocumentSyncer(adapter, collectionSlug, tableName, tableConfig, embeddingService, options)
  await syncer.sync(doc, operation)

  logger.info('Document synced successfully to index', {
    documentId: doc.id,
    collection: collectionSlug,
    tableName,
    operation
  })
}

/**
 * Deletes a document from the index
 * Handles both direct document deletion and chunk deletion
 *
 * @param adapter - The indexer adapter to use
 * @param collectionSlug - The Payload collection slug
 * @param docId - The document ID to delete
 * @param tableConfig - The table configuration
 */
/**
 * Deletes a document and all associated chunks from all tables for a collection
 * @param adapter - The indexer adapter to use
 * @param collectionSlug - The Payload collection slug
 * @param docId - The document ID to delete
 * @param tableConfigs - All table configurations for the collection
 */
/**
 * Deletes a document and all associated chunks from one or more tables for a collection
 * @param adapter - The indexer adapter to use
 * @param collectionSlug - The Payload collection slug
 * @param docId - The document ID to delete
 * @param tableConfigs - One or more table configurations for the collection
 */
export const deleteDocumentFromIndex = async (
  adapter: IndexerAdapter,
  collectionSlug: string,
  docId: string,
  tableConfigs: TableConfig | TableConfig[]
) => {
  const configs = Array.isArray(tableConfigs) ? tableConfigs : [tableConfigs]
  let deleted = false
  for (const tableConfig of configs) {
    const tableName = getIndexCollectionName(collectionSlug, tableConfig)
    try {
      // Si la tabla es de chunks (embedding.chunking), borra solo por parent_doc_id
      if (tableConfig.embedding?.chunking) {
        logger.debug('Deleting all chunks by parent_doc_id', {
          parent_doc_id: docId,
          tableName
        })
        await adapter.deleteDocumentsByFilter(tableName, {
          parent_doc_id: docId
        })
        logger.info('All chunks deleted for document', {
          documentId: docId,
          tableName
        })
        deleted = true
      } else {
        // Tabla principal: borra por id y si no existe, intenta por parent_doc_id
        try {
          await adapter.deleteDocument(tableName, docId)
          logger.info('Document deleted from index', {
            documentId: docId,
            tableName
          })
          deleted = true
        } catch (_docDeleteError: unknown) {
          logger.debug('Document not found, attempting to delete chunks', {
            documentId: docId,
            tableName
          })
          try {
            await adapter.deleteDocumentsByFilter(tableName, {
              parent_doc_id: docId
            })
            logger.info('All chunks deleted for document', {
              documentId: docId,
              tableName
            })
          } catch (_chunkDeleteError: unknown) {
            logger.debug('No chunks found to delete', { documentId: docId })
          }
        }
      }
    } catch (error: unknown) {
      logger.error('Failed to delete document from index', error as Error, {
        documentId: docId,
        collection: collectionSlug,
        tableName
      })
    }
  }
  if (deleted) recordDeletion(collectionSlug, docId)
}

/**
 * Document syncer class that handles the actual sync logic
 */
export class DocumentSyncer {
  constructor(
    private adapter: IndexerAdapter,
    private collectionSlug: string,
    private tableName: string,
    private config: TableConfig,
    private embeddingService?: EmbeddingService,
    private options?: SyncOptions
  ) {}

  /** True when the backend (not the indexer) generates the embedding. */
  private get isAutoEmbed(): boolean {
    return this.config.embedding?.autoEmbed !== undefined
  }

  async sync(doc: PayloadDocument, operation: 'create' | 'update'): Promise<void> {
    logger.debug(`Syncing document ${doc.id} to table ${this.tableName}`)

    if (this.config.embedding?.chunking) {
      await this.syncChunked(doc, operation)
    } else {
      await this.syncDocument(doc, operation)
    }
  }

  private async syncDocument(doc: PayloadDocument, operation: 'create' | 'update'): Promise<void> {
    // 1. Map fields
    const mappedFields = await mapPayloadDocumentToIndex(doc, this.config.fields)

    // 2. Extract source text and compute hash (if embedding configured)
    const sourceText = this.config.embedding?.fields ? await this.extractSourceText(doc) : ''
    const contentHash = sourceText ? computeContentHash(sourceText) : undefined

    // 3. Check if content is unchanged on update — skip re-embedding (opt-in)
    if (
      contentHash &&
      operation === 'update' &&
      !this.options?.forceReindex &&
      this.config.embedding?.reuseEmbeddingsWhenContentUnchanged
    ) {
      const unchanged = await this.isContentUnchanged(contentHash, String(doc.id))
      if (unchanged) {
        const updated = await this.updateMetadataOnly(doc, contentHash)
        if (updated) return
      }
    }

    // 4. Build index document with standard fields
    const indexDoc: Record<string, unknown> = {
      ...mappedFields,
      id: String(doc.id),
      slug: doc.slug || '',
      createdAt: new Date(doc.createdAt).getTime(),
      updatedAt: new Date(doc.updatedAt).getTime(),
      ...(doc.publishedAt && { publishedAt: new Date(doc.publishedAt).getTime() }),
      ...(contentHash && { content_hash: contentHash })
    }

    // 5. Generate embedding if configured (skipped under autoEmbed — the
    //    backend reads `embedding.autoEmbed.from` and generates the vector
    //    itself on every upsert).
    if (sourceText && this.embeddingService && !this.isAutoEmbed) {
      const embedding = await this.generateEmbedding(sourceText, doc.id)
      if (embedding) indexDoc.embedding = embedding
    }

    // 6. Upsert using adapter
    await this.adapter.upsertDocument(this.tableName, indexDoc as IndexDocument)

    recordSyncSuccess(this.collectionSlug, String(doc.id))
    logger.info(`Synced document ${doc.id} to ${this.tableName}`)
  }

  private async syncChunked(doc: PayloadDocument, operation: 'create' | 'update'): Promise<void> {
    // 1. Extract source text
    const sourceText = await this.extractSourceText(doc)
    if (!sourceText) {
      logger.warn(`No source text found for document ${doc.id}`)
      return
    }

    // 2. Compute content hash and check for changes
    const contentHash = computeContentHash(sourceText)

    if (
      operation === 'update' &&
      !this.options?.forceReindex &&
      this.config.embedding?.reuseEmbeddingsWhenContentUnchanged
    ) {
      const unchanged = await this.isContentUnchanged(contentHash, String(doc.id))
      if (unchanged) {
        const updated = await this.updateMetadataOnly(doc, contentHash)
        if (updated) return
      }
    }

    // 3. Generate chunks
    const chunks = await this.generateChunks(sourceText)

    // 4. Prepare base metadata (extra fields)
    const fields = this.config.fields ? await mapPayloadDocumentToIndex(doc, this.config.fields) : {}
    fields.slug = doc.slug || ''
    fields.publishedAt = doc.publishedAt ? new Date(doc.publishedAt).getTime() : undefined

    // 5. Build all chunk documents BEFORE any mutation
    const chunkDocs = await this.buildAllChunkDocuments(chunks, doc, contentHash, fields)

    if (chunkDocs.length === 0) {
      logger.warn(`All chunks skipped for document ${doc.id} (embedding failures)`)
      return
    }

    // 6. Delete old chunks ONLY after new batch is ready (if update)
    if (operation === 'update') {
      await this.adapter.deleteDocumentsByFilter(this.tableName, { parent_doc_id: String(doc.id) })
    }

    // 7. Batch upsert all chunks atomically — if this fails, old chunks are already gone
    //    but the alternative (delete after upsert) risks duplicates. This is the safer path
    //    because partial inserts are recoverable via re-sync.
    await this.adapter.upsertDocuments(this.tableName, chunkDocs)

    recordSyncSuccess(this.collectionSlug, String(doc.id), chunkDocs.length)
    logger.info(`Synced ${chunkDocs.length} chunks for document ${doc.id} to ${this.tableName}`)
  }

  /**
   * Build all chunk IndexDocuments without side effects.
   * Respects `onEmbeddingFailure` config for handling embedding failures.
   */
  private async buildAllChunkDocuments(
    chunks: TextChunk[],
    doc: PayloadDocument,
    contentHash: string,
    fields: Record<string, unknown>
  ): Promise<IndexDocument[]> {
    const failureBehavior: EmbeddingFailureBehavior = this.config.embedding?.onEmbeddingFailure ?? 'skip-chunk'
    const chunkDocs: IndexDocument[] = []

    for (const chunk of chunks) {
      const chunkDoc = await this.buildChunkDocument(chunk, doc, contentHash, fields, failureBehavior)
      if (chunkDoc) {
        chunkDocs.push(chunkDoc)
      }
    }

    return chunkDocs
  }

  /**
   * Build a single chunk IndexDocument (pure — no upsert).
   * Returns null if the chunk should be skipped (e.g. embedding failure with 'skip-chunk').
   */
  private async buildChunkDocument(
    chunk: TextChunk,
    doc: PayloadDocument,
    contentHash: string,
    fields: Record<string, unknown>,
    failureBehavior: EmbeddingFailureBehavior
  ): Promise<IndexDocument | null> {
    const headers = buildHeaderHierarchy(chunk.metadata)
    let formattedText = formatChunkWithHeaders(chunk.text, headers)

    if (this.config.embedding?.chunking?.interceptResult) {
      formattedText = this.config.embedding.chunking.interceptResult({ ...chunk, headers, formattedText }, doc)
    }

    const baseChunk: Record<string, unknown> = {
      id: `${doc.id}_chunk_${chunk.index}`,
      parent_doc_id: String(doc.id),
      chunk_index: chunk.index,
      chunk_text: formattedText,
      is_chunk: true,
      headers,
      createdAt: new Date(doc.createdAt).getTime(),
      updatedAt: new Date(doc.updatedAt).getTime(),
      content_hash: contentHash,
      ...fields
    }

    // Under autoEmbed, the backend produces the vector from `chunk_text` (or
    // whatever fields are listed in `embedding.autoEmbed.from`). We must not
    // send an `embedding` property — Typesense rejects writes to autoEmbed
    // fields.
    if (this.isAutoEmbed) {
      return baseChunk as IndexDocument
    }

    const embedding = await this.generateEmbedding(formattedText, doc.id, chunk.index)

    if (!embedding) {
      recordEmbeddingFailure(this.collectionSlug, String(doc.id), chunk.index)
      switch (failureBehavior) {
        case 'error':
          throw new Error(
            `Embedding generation failed for chunk ${chunk.index} of document ${doc.id} in ${this.collectionSlug}`
          )
        case 'skip-chunk':
          logger.warn(`Skipping chunk ${chunk.index} for document ${doc.id} — embedding failed`)
          return null
        case 'empty-vector':
          // Fall through with empty array (legacy behavior)
          break
      }
    }

    return {
      ...baseChunk,
      embedding: embedding ?? []
    } as IndexDocument
  }

  /**
   * Check if the content hash in the index matches the current content hash.
   * Returns false (triggering full re-index) if:
   * - adapter lacks searchDocumentsByFilter
   * - no existing docs found
   * - query fails (safe fallback)
   */
  private async isContentUnchanged(contentHash: string, docId: string): Promise<boolean> {
    if (!this.adapter.searchDocumentsByFilter) return false

    try {
      const filter = this.config.embedding?.chunking ? { parent_doc_id: docId } : { id: docId }

      const docs = await this.adapter.searchDocumentsByFilter<{ content_hash?: string }>(this.tableName, filter, {
        includeFields: ['id', 'content_hash'],
        limit: 1
      })

      if (docs.length === 0 || !docs[0].content_hash) return false

      const unchanged = docs[0].content_hash === contentHash
      if (unchanged) {
        logger.info('Content unchanged, updating metadata only', {
          documentId: docId,
          collection: this.collectionSlug,
          tableName: this.tableName
        })
      }
      return unchanged
    } catch (error) {
      logger.warn('Failed to check content hash, falling back to full re-index', {
        documentId: docId,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * Update only metadata fields on existing indexed documents (no re-embedding).
   * Uses direct update for single docs, filter-based batch update for chunks.
   */
  private async updateMetadataOnly(doc: PayloadDocument, contentHash: string): Promise<boolean> {
    const fields = this.config.fields ? await mapPayloadDocumentToIndex(doc, this.config.fields) : {}

    const metadataUpdate: Record<string, unknown> = {
      ...fields,
      slug: doc.slug || '',
      updatedAt: new Date(doc.updatedAt).getTime(),
      content_hash: contentHash,
      ...(doc.publishedAt && {
        publishedAt: new Date(doc.publishedAt).getTime()
      })
    }

    if (this.config.embedding?.chunking) {
      // Chunks: batch update all chunks by parent_doc_id
      if (!this.adapter.updateDocumentsByFilter) return false
      const updated = await this.adapter.updateDocumentsByFilter(
        this.tableName,
        { parent_doc_id: String(doc.id) },
        metadataUpdate
      )
      logger.info(`Metadata-only update for document ${doc.id}: ${updated} chunks updated in ${this.tableName}`)
    } else {
      // Single document: direct update by ID (1 roundtrip)
      if (!this.adapter.updateDocument) return false
      await this.adapter.updateDocument(this.tableName, String(doc.id), metadataUpdate)
      logger.info(`Metadata-only update for document ${doc.id} in ${this.tableName}`)
    }

    return true
  }

  /**
   * Generate an embedding for the given text, logging a warning on failure.
   */
  private async generateEmbedding(text: string, docId: string, chunkIndex?: number): Promise<number[] | null> {
    if (!this.embeddingService) return null

    const result = await this.embeddingService.getEmbedding(text)
    if (result) return result

    logger.warn('Embedding generation failed', {
      documentId: docId,
      collection: this.collectionSlug,
      ...(chunkIndex !== undefined && { chunkIndex }),
      textLength: text.length,
      textPreview: text.substring(0, 200) + (text.length > 200 ? '...' : '')
    })
    return null
  }

  /**
   * Extract and transform source fields for embedding generation
   */
  private async extractSourceText(doc: PayloadDocument): Promise<string> {
    if (!this.config.embedding?.fields) return ''

    const textParts: string[] = []

    for (const sourceField of this.config.embedding.fields) {
      let fieldName: string
      let transform: ((value: unknown, ...args: unknown[]) => unknown | Promise<unknown>) | undefined

      if (typeof sourceField === 'string') {
        fieldName = sourceField
      } else {
        fieldName = sourceField.field
        transform = sourceField.transform
      }

      let val = doc[fieldName]

      // Apply transform if provided (pass doc as 2nd arg for transforms that need it)
      if (transform) {
        val = await transform(val, doc)
      } else if (typeof val === 'object' && val !== null && 'root' in val) {
        // Default handling for RichText if no transform
        val = JSON.stringify(val)
      }

      textParts.push(String(val || ''))
    }

    return textParts.join('\n\n')
  }

  private async generateChunks(text: string) {
    if (!this.config.embedding?.chunking) return []

    const { strategy, size, overlap } = this.config.embedding.chunking
    const options = { maxChunkSize: size, overlap }

    if (strategy === 'markdown') {
      return await chunkMarkdown(text, options)
    } else {
      return await chunkText(text, options)
    }
  }
}
