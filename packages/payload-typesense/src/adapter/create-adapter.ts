/**
 * Factory function for creating a TypesenseAdapter
 */

import { Client } from 'typesense'
import type { TypesenseConnectionConfig } from '../shared/types/plugin-types'
import type { RetryConfig } from './retry'
import { TypesenseAdapter } from './typesense-adapter'

export interface TypesenseAdapterOptions {
  /** Typesense connection configuration */
  connection: TypesenseConnectionConfig
  /**
   * Retry configuration for transient errors (timeout, 503, 429, ECONNREFUSED).
   * Applied to mutation operations: upsert, delete, batch import.
   * Set to `false` to disable retry (default: 3 retries, 500ms base delay).
   */
  retry?: RetryConfig | false
}

/**
 * Creates a TypesenseAdapter instance with the provided configuration
 *
 * @param config - Typesense connection configuration, or full options object
 * @returns A configured TypesenseAdapter instance
 *
 * @example
 * ```typescript
 * import { createTypesenseAdapter } from '@zetesis/payload-typesense';
 *
 * const adapter = createTypesenseAdapter({
 *   apiKey: process.env.TYPESENSE_API_KEY!,
 *   nodes: [{
 *     host: 'localhost',
 *     port: 8108,
 *     protocol: 'http'
 *   }]
 * });
 * ```
 */
export function createTypesenseAdapter(config: TypesenseConnectionConfig | TypesenseAdapterOptions): TypesenseAdapter {
  // Support both legacy (connection-only) and new (full options) signatures
  const isFullOptions = 'connection' in config
  const connectionConfig = isFullOptions ? config.connection : config
  const retryConfig = isFullOptions && config.retry !== false ? config.retry : undefined

  const client = new Client({
    apiKey: connectionConfig.apiKey,
    nodes: connectionConfig.nodes,
    connectionTimeoutSeconds: connectionConfig.connectionTimeoutSeconds ?? 10,
    retryIntervalSeconds: connectionConfig.retryIntervalSeconds,
    numRetries: connectionConfig.numRetries
  })

  return new TypesenseAdapter(client, retryConfig)
}

/**
 * Creates a TypesenseAdapter from an existing Typesense Client
 * Useful when you already have a configured client instance
 *
 * @param client - Existing Typesense Client instance
 * @param retryConfig - Optional retry configuration for transient errors
 * @returns A TypesenseAdapter instance wrapping the provided client
 */
export function createTypesenseAdapterFromClient(client: Client, retryConfig?: RetryConfig): TypesenseAdapter {
  return new TypesenseAdapter(client, retryConfig)
}
