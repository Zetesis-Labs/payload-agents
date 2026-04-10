/**
 * Typesense client factory. One client per server instance — no module-level
 * singletons, to keep the package reusable across multiple concurrent
 * servers in the same process.
 */

import { Client as TypesenseClient } from 'typesense'
import type { TypesenseConnectionConfig } from '../types'

export function createTypesenseClient(config: TypesenseConnectionConfig): TypesenseClient {
  return new TypesenseClient({
    apiKey: config.apiKey,
    nodes: [
      {
        host: config.host,
        port: config.port,
        protocol: config.protocol
      }
    ],
    connectionTimeoutSeconds: config.connectionTimeoutSeconds ?? 10
  })
}
