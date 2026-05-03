import type { TypesenseConnectionConfig } from '@zetesis/payload-typesense'

export const typesenseConnection: TypesenseConnectionConfig = {
  apiKey: process.env.TYPESENSE_API_KEY || 'xyz',
  connectionTimeoutSeconds: 30,
  nodes: [
    {
      host: process.env.TYPESENSE_HOST || 'localhost',
      port: Number.parseInt(process.env.TYPESENSE_PORT || '8108', 10),
      protocol: (process.env.TYPESENSE_PROTOCOL as 'http' | 'https') || 'http'
    }
  ]
}
