import type { CollectionConfig } from 'payload'

export interface DocumentsPluginOverrides {
  collection?: (collection: CollectionConfig) => CollectionConfig
}

/**
 * When set, the parse endpoint enqueues a task on a `payload-worker-builder`
 * runtime instead of calling LlamaParse inline. The worker downloads the
 * upload, runs the parse, and writes `parsed_text` / `parse_status` back via
 * Payload REST. The parse-status endpoint becomes a passive read in this mode
 * (it returns the document's current `parse_status` without touching LlamaParse).
 */
export interface DocumentsWorkerConfig {
  /**
   * Base URL of the FastAPI HTTP "kicker" exposed by the worker
   * (e.g. `http://localhost:8001` or `http://payload-worker:8001`).
   */
  url: string
  /**
   * Shared secret sent as `X-Internal-Secret`. Must match the value
   * `payload-worker-builder.RuntimeConfig.internal_secret` was built with.
   */
  internalSecret: string
}

export interface DocumentsPluginConfig {
  /**
   * Slug of the collection to register. Defaults to `documents`.
   */
  collectionSlug?: string
  /**
   * LlamaParse (LlamaIndex Cloud) API key. Defaults to `process.env.LLAMA_CLOUD_API_KEY`.
   * Ignored when `worker` is set: the worker holds its own credentials.
   */
  llamaParseApiKey?: string
  /**
   * Override the base URL of the LlamaParse API. Defaults to the public LlamaIndex Cloud endpoint.
   * Ignored when `worker` is set.
   */
  llamaParseBaseUrl?: string
  /**
   * Optional async-worker mode. When provided, `POST /:id/parse` queues a job
   * on the worker via HTTP and returns immediately; LlamaParse upload + polling
   * + writeback all happen in the worker process. When absent, the plugin runs
   * the parse inline (legacy behavior, useful for small deploys + tests).
   */
  worker?: DocumentsWorkerConfig
  /**
   * Hooks to let host apps customize the generated collection
   * (access, admin group, tenant wiring, etc.) without forking the plugin.
   */
  overrides?: DocumentsPluginOverrides
}

export interface DocumentsPluginResult {
  plugin: (config: import('payload').Config) => import('payload').Config
}

export const DEFAULT_COLLECTION_SLUG = 'documents'
