import type { TableConfig } from '@zetesis/payload-indexer'
import type { CollectionSlug } from 'payload'
import type { TypesenseFieldMapping } from '../../adapter/types'
import type { EmbeddingProviderConfig, TypesenseConnectionConfig } from '../../shared/types/plugin-types'

// --- Search Feature Config ---

export type SearchMode = 'semantic' | 'keyword' | 'hybrid'

export interface SearchDefaults {
  mode?: SearchMode
  perPage?: number
  tables?: string[]
}

export interface SearchFeatureConfig {
  enabled: boolean
  defaults?: SearchDefaults
}

// --- Sync Feature Config ---

export interface SyncFeatureConfig {
  enabled: boolean
  autoSync?: boolean
  batchSize?: number
}

// --- Main Configuration ---

export interface FeatureFlags {
  /**
   * Plugin-level embedding provider. Used as a fallback for tables that
   * don't declare their own `embedding.provider` and don't use `autoEmbed`.
   * Optional: when every table has its own provider or is autoEmbed, this
   * can be omitted entirely.
   */
  embedding?: EmbeddingProviderConfig
  search?: SearchFeatureConfig
  sync?: SyncFeatureConfig
}

export interface ModularPluginConfig {
  typesense: TypesenseConnectionConfig
  features: FeatureFlags
  collections: Record<CollectionSlug | string, TableConfig<TypesenseFieldMapping>[]>
  /** Resolve document type from Typesense collection name */
  documentTypeResolver?: (collectionName: string) => string
}
