/**
 * Types for the composable Typesense RAG plugin
 */

import type { TableConfig } from '@zetesis/payload-indexer'
import type { TypesenseFieldMapping } from '../adapter/types'
import type {
  AdvancedSearchConfig,
  HNSWConfig,
  HybridSearchConfig,
  RAGCallbacks,
  TypesenseConnectionConfig
} from '../shared/types/plugin-types'

/**
 * Search feature configuration for the Typesense RAG plugin
 */
export interface TypesenseSearchConfig {
  /** Enable search endpoints */
  enabled: boolean
  /** Default search settings */
  defaults?: {
    /** Search mode: 'semantic' | 'hybrid' | 'keyword' */
    mode?: 'semantic' | 'hybrid' | 'keyword'
    /** Results per page */
    perPage?: number
    /** Tables to search by default */
    tables?: string[]
  }
}

/**
 * Configuration for the Typesense RAG plugin
 */
export interface TypesenseRAGPluginConfig {
  /** Typesense connection configuration */
  typesense: TypesenseConnectionConfig

  /** Collection configurations (for schema sync) */
  collections?: Record<string, TableConfig<TypesenseFieldMapping>[]>

  /** Search configuration */
  search?: TypesenseSearchConfig

  /** Callback functions for permissions */
  callbacks?: RAGCallbacks

  /** Hybrid search configuration */
  hybrid?: HybridSearchConfig

  /** HNSW optimization configuration */
  hnsw?: HNSWConfig

  /** Advanced search configuration */
  advanced?: AdvancedSearchConfig

  /** Resolve document type from Typesense collection name (e.g. 'posts_chunk' → 'post') */
  documentTypeResolver?: (collectionName: string) => string
}
