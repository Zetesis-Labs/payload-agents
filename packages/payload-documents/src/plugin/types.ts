import type { CollectionConfig } from 'payload'

export interface DocumentsPluginOverrides {
  collection?: (collection: CollectionConfig) => CollectionConfig
}

export interface DocumentsPluginConfig {
  /**
   * Slug of the collection to register. Defaults to `documents`.
   */
  collectionSlug?: string
  /**
   * LlamaParse (LlamaIndex Cloud) API key. Defaults to `process.env.LLAMA_CLOUD_API_KEY`.
   */
  llamaParseApiKey?: string
  /**
   * Override the base URL of the LlamaParse API. Defaults to the public LlamaIndex Cloud endpoint.
   */
  llamaParseBaseUrl?: string
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
