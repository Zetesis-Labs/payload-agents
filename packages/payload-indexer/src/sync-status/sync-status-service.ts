/**
 * Sync status service - compares content hashes between Payload documents and their indexed counterparts
 */

import type { IndexerAdapter } from '../adapter/types'
import { logger } from '../core/logging/logger'
import { computeContentHash } from '../core/utils/content-hash'
import type { PayloadDocument, SourceField, TableConfig } from '../document/types'
import { getIndexCollectionName } from '../plugin/utils/naming'
import type { BatchSyncStatusResult, SyncStatusResult, SyncStatusValue } from './types'

/**
 * Extract source text from a document using the table config's embedding fields.
 * Mirrors the logic in DocumentSyncer.extractSourceText()
 */
const extractSourceText = async (doc: PayloadDocument, tableConfig: TableConfig): Promise<string> => {
  if (!tableConfig.embedding?.fields) return ''

  const textParts: string[] = []

  for (const sourceField of tableConfig.embedding.fields) {
    let fieldName: string
    let transform: ((value: unknown, ...args: unknown[]) => unknown | Promise<unknown>) | undefined

    if (typeof sourceField === 'string') {
      fieldName = sourceField
    } else {
      fieldName = (sourceField as SourceField).field
      transform = (sourceField as SourceField).transform
    }

    let val = doc[fieldName]

    if (transform) {
      val = await transform(val, doc)
    } else if (typeof val === 'object' && val !== null && 'root' in val) {
      val = JSON.stringify(val)
    }

    textParts.push(String(val || ''))
  }

  return textParts.join('\n\n')
}

interface IndexedHashesLookup {
  /** Hashes keyed by documentId. Missing key means "not indexed". */
  hashes: Map<string, string | undefined>
  /** Documents whose lookup raised — caller must surface as `'error'`, not `'not-indexed'`. */
  errored: Map<string, string>
  /** True when the adapter does not support filter-based search at all. */
  adapterUnsupported: boolean
}

/**
 * Query the adapter for stored content hashes of one or more documents.
 *
 * The returned shape distinguishes three states so callers can tell
 * "really not indexed" apart from "we don't know because the lookup
 * failed" — critical when Typesense is down and we would otherwise mark
 * every document as `'not-indexed'`.
 */
const getIndexedHashes = async (
  adapter: IndexerAdapter,
  tableName: string,
  docIds: string[],
  isChunked: boolean
): Promise<IndexedHashesLookup> => {
  const hashes = new Map<string, string | undefined>()
  const errored = new Map<string, string>()

  if (!adapter.searchDocumentsByFilter) {
    return { hashes, errored, adapterUnsupported: true }
  }

  for (const docId of docIds) {
    try {
      const filter = isChunked ? { parent_doc_id: docId } : { id: docId }

      const docs = await adapter.searchDocumentsByFilter<{ id: string; content_hash?: string; parent_doc_id?: string }>(
        tableName,
        filter,
        { includeFields: ['id', 'content_hash'], limit: 1 }
      )

      const firstDoc = docs[0]
      if (firstDoc) {
        hashes.set(docId, firstDoc.content_hash)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('Failed to fetch indexed hash', {
        documentId: docId,
        tableName,
        error: message
      })
      errored.set(docId, message)
    }
  }

  return { hashes, errored, adapterUnsupported: false }
}

/**
 * Check the sync status of a single document against the index
 */
export const checkSyncStatus = async (
  adapter: IndexerAdapter,
  collectionSlug: string,
  doc: PayloadDocument,
  tableConfig: TableConfig
): Promise<SyncStatusResult> => {
  const tableName = getIndexCollectionName(collectionSlug, tableConfig)
  const docId = String(doc.id)

  try {
    // 1. Extract source text and compute current hash
    const sourceText = await extractSourceText(doc, tableConfig)
    if (!sourceText) {
      return { status: 'not-indexed', documentId: docId }
    }

    const currentHash = computeContentHash(sourceText)

    // 2. Query the adapter for the stored hash
    if (!adapter.searchDocumentsByFilter) {
      return {
        status: 'error',
        documentId: docId,
        currentHash,
        error: 'Adapter does not support searchDocumentsByFilter'
      }
    }

    const isChunked = Boolean(tableConfig.embedding?.chunking)
    const filter = isChunked ? { parent_doc_id: docId } : { id: docId }

    const docs = await adapter.searchDocumentsByFilter<{ content_hash?: string }>(tableName, filter, {
      includeFields: ['id', 'content_hash'],
      limit: 1
    })

    // 3. Compare
    const firstDoc = docs[0]
    if (!firstDoc) {
      return { status: 'not-indexed', documentId: docId, currentHash }
    }

    const indexedHash = firstDoc.content_hash
    if (!indexedHash) {
      return { status: 'outdated', documentId: docId, currentHash, indexedHash: undefined }
    }

    const status: SyncStatusValue = currentHash === indexedHash ? 'synced' : 'outdated'
    return { status, documentId: docId, currentHash, indexedHash }
  } catch (error) {
    logger.error('Failed to check sync status', error instanceof Error ? error : new Error(String(error)), {
      documentId: docId,
      collection: collectionSlug,
      tableName
    })
    return {
      status: 'error',
      documentId: docId,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Check the sync status of multiple documents against the index (batch)
 */
export const checkBatchSyncStatus = async (
  adapter: IndexerAdapter,
  collectionSlug: string,
  docs: PayloadDocument[],
  tableConfig: TableConfig
): Promise<BatchSyncStatusResult> => {
  const tableName = getIndexCollectionName(collectionSlug, tableConfig)
  const isChunked = Boolean(tableConfig.embedding?.chunking)
  const results = new Map<string, SyncStatusResult>()
  const counts: Record<SyncStatusValue, number> = { synced: 0, outdated: 0, 'not-indexed': 0, error: 0 }

  // 1. Compute current hashes for all documents
  const currentHashes = new Map<string, string>()
  for (const doc of docs) {
    const sourceText = await extractSourceText(doc, tableConfig)
    if (sourceText) {
      currentHashes.set(String(doc.id), computeContentHash(sourceText))
    }
  }

  // 2. Batch fetch indexed hashes
  const docIds = docs.map(d => String(d.id))
  const lookup = await getIndexedHashes(adapter, tableName, docIds, isChunked)

  // 3. Compare — if the adapter can't search at all, every doc is an error.
  for (const doc of docs) {
    const docId = String(doc.id)
    const currentHash = currentHashes.get(docId)
    const indexedHash = lookup.hashes.get(docId)

    let status: SyncStatusValue
    let error: string | undefined

    if (lookup.adapterUnsupported) {
      status = 'error'
      error = 'Adapter does not support searchDocumentsByFilter'
    } else if (lookup.errored.has(docId)) {
      status = 'error'
      error = lookup.errored.get(docId)
    } else if (!currentHash) {
      status = 'not-indexed'
    } else if (!lookup.hashes.has(docId)) {
      status = 'not-indexed'
    } else if (!indexedHash) {
      status = 'outdated'
    } else {
      status = currentHash === indexedHash ? 'synced' : 'outdated'
    }

    results.set(docId, { status, documentId: docId, currentHash, indexedHash, error })
    counts[status]++
  }

  return { results, total: docs.length, counts }
}
