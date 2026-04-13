'use server'

import type { PayloadDocument } from '@zetesis/payload-indexer'
import { createEmbeddingService, createLogger, syncDocumentToIndex } from '@zetesis/payload-indexer'
import { createTypesenseAdapter } from '@zetesis/payload-typesense'
import type { Payload } from 'payload'
import { getPayload } from '@/modules/get-payload'
import { collections } from '@/plugins/typesense/collections'
import { embeddingConfig, typesenseConnection } from '@/plugins/typesense/config'
import { seedPost } from '@/seed/post.seed'
import type { CollectionTarget, ImportMode, ImportResult, SyncResults } from './admin-types'

const BATCH_SIZE = 50

const toIndexableDocument = <T extends { id: number | string }>(doc: T): PayloadDocument => {
  const record = doc as unknown as Record<string, unknown>
  return {
    ...record,
    id: String(doc.id),
    slug: typeof record.slug === 'string' ? record.slug : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  } as PayloadDocument
}

async function syncCollectionToTypesense(payload: Payload, collectionSlug: CollectionTarget): Promise<SyncResults> {
  const adapter = createTypesenseAdapter(typesenseConnection)
  const tableConfigs = collections[collectionSlug]

  if (!tableConfigs || tableConfigs.length === 0) {
    throw new Error(`${collectionSlug} collection is not configured for indexing`)
  }

  const enabledConfigs = tableConfigs.filter(tc => tc.enabled)
  if (enabledConfigs.length === 0) {
    throw new Error(`No enabled table configs for ${collectionSlug}`)
  }

  const logger = createLogger({ prefix: '[Sync]' })
  const embeddingService = createEmbeddingService(embeddingConfig, logger)

  const response = await payload.find({
    collection: collectionSlug,
    limit: 0,
    depth: 1,
    overrideAccess: true
  })

  const results: SyncResults = { synced: 0, errors: [] }

  payload.logger.info(
    `[Sync] Starting sync of ${response.totalDocs} ${collectionSlug} to Typesense (${enabledConfigs.length} tables)...`
  )

  for (const doc of response.docs) {
    try {
      const indexableDoc = toIndexableDocument(doc)
      for (const tableConfig of enabledConfigs) {
        await syncDocumentToIndex(
          adapter,
          collectionSlug,
          indexableDoc,
          'update',
          tableConfig,
          tableConfig.embedding ? embeddingService : undefined
        )
      }
      results.synced++
    } catch (error: unknown) {
      const errorMsg = `${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
      results.errors.push(errorMsg)
      payload.logger.error(`[Sync] Error syncing ${collectionSlug} ${errorMsg}`)
    }
  }

  payload.logger.info(`[Sync] Completed: ${results.synced} synced, ${results.errors.length} errors`)

  return results
}

async function processImportEntries(
  payload: Payload,
  entries: Record<string, unknown>[],
  collection: CollectionTarget,
  mode: ImportMode
): Promise<Pick<ImportResult, 'results' | 'syncResults' | 'needsSync'>> {
  payload.logger.info(`[Import] ${entries.length} ${collection} to process (index sync disabled for speed)`)

  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as string[]
  }

  const seeder = seedPost(payload, 'upsert', { skipIndexSync: true })

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(entries.length / BATCH_SIZE)

    payload.logger.info(`[Import] Batch ${batchNum}/${totalBatches}`)

    for (const entry of batch) {
      try {
        await seeder(entry as Parameters<ReturnType<typeof seedPost>>[0])
        results.imported++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        const entryId = (entry as { id?: unknown }).id ?? 'unknown'
        results.errors.push(`Entry ${entryId}: ${errorMsg}`)
        payload.logger.error(`[Import] Error processing entry ${entryId}: ${errorMsg}`)
      }
    }
  }

  let syncResults: SyncResults | undefined
  if (mode === 'import-sync') {
    payload.logger.info(`[Import] Starting Typesense sync for ${collection}...`)
    syncResults = await syncCollectionToTypesense(payload, collection)
  }

  payload.logger.info(`[Import] Completed: ${results.imported} imported, ${results.errors.length} errors.`)

  return { results, syncResults, needsSync: mode === 'import' }
}

export async function importCollectionData({
  jsonContent,
  collection,
  mode = 'import'
}: {
  jsonContent?: string
  collection: CollectionTarget
  mode?: ImportMode
}): Promise<ImportResult> {
  const payload = await getPayload()

  try {
    if (mode === 'sync') {
      payload.logger.info(`[Sync] Starting sync-only mode for ${collection}`)
      const syncResults = await syncCollectionToTypesense(payload, collection)
      return {
        success: true,
        message: `Sync completed: ${syncResults.synced} synced, ${syncResults.errors.length} errors`,
        syncResults
      }
    }

    if (!jsonContent) {
      return { success: false, message: 'Se requiere un archivo JSON para importar' }
    }

    const parsed = JSON.parse(jsonContent)
    const entries: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed]

    const importResult = await processImportEntries(payload, entries, collection, mode)

    return {
      success: true,
      message: mode === 'import-sync' ? 'Import and sync completed.' : 'Import completed.',
      totalEntries: entries.length,
      ...importResult
    }
  } catch (error) {
    payload.logger.error(`[Import] Fatal error: ${error}`)
    return {
      success: false,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}
