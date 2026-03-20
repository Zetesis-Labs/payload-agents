import type { EmbeddingProviderConfig } from '@zetesis/payload-indexer'
import type { TypesenseConnectionConfig } from '@zetesis/payload-typesense'

export const typesenseConnection: TypesenseConnectionConfig = {
  apiKey: process.env.TYPESENSE_API_KEY || 'xyz',
  nodes: [
    {
      host: process.env.TYPESENSE_HOST || 'localhost',
      port: Number.parseInt(process.env.TYPESENSE_PORT || '8108', 10),
      protocol: (process.env.TYPESENSE_PROTOCOL as 'http' | 'https') || 'http'
    }
  ]
}

export const embeddingConfig: EmbeddingProviderConfig = {
  type: 'openai',
  model: 'text-embedding-3-small',
  dimensions: 1536,
  apiKey: process.env.OPENAI_API_KEY as string
}
