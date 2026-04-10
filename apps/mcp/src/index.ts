/**
 * MCP server using @zetesis/mcp-typesense.
 *
 * Thin wrapper around `@zetesis/mcp-typesense` with env-var config.
 * All the runtime (tools, resources, transport, sampling) lives in the
 * package; this file is just:
 * - Env-var reading
 * - Collection topology (posts_chunk, books_chunk)
 * - Server instructions and guide markdown
 */

import {
  createMcpServer,
  DEFAULT_GUIDE,
  DEFAULT_INSTRUCTIONS,
} from '@zetesis/mcp-typesense'

const PAYLOAD_API_URL = process.env.PAYLOAD_API_URL || 'http://localhost:3000'
const PORT = parseInt(process.env.MCP_PORT || '3001', 10)

const mcp = createMcpServer({
  server: {
    name: 'mcp-typesense',
    version: '0.1.0',
    instructions: DEFAULT_INSTRUCTIONS,
  },
  transport: {
    port: PORT,
  },
  typesense: {
    host: process.env.TYPESENSE_HOST || '127.0.0.1',
    port: parseInt(process.env.TYPESENSE_PORT || '8108', 10),
    protocol: (process.env.TYPESENSE_PROTOCOL as 'http' | 'https') || 'http',
    apiKey: process.env.TYPESENSE_API_KEY || 'xyz',
  },
  embeddings: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  },
  collections: [
    {
      key: 'posts',
      displayName: 'Posts (Chunks)',
      chunkCollection: 'posts_chunk',
      parentCollection: 'posts',
      chunkSearchFields: ['chunk_text', 'title'],
      chunkFacetFields: ['tenant', 'taxonomy_slugs', 'parent_doc_id', 'headers'],
      kind: 'document',
    },
    {
      key: 'books',
      displayName: 'Books (Chunks)',
      chunkCollection: 'books_chunk',
      parentCollection: 'books',
      chunkSearchFields: ['chunk_text', 'title'],
      chunkFacetFields: ['tenant', 'taxonomy_slugs', 'parent_doc_id', 'headers'],
      kind: 'book',
    },
  ],
  taxonomy: {
    source: { type: 'payload-rest', baseUrl: PAYLOAD_API_URL },
  },
  content: {
    source: { type: 'payload-rest', baseUrl: PAYLOAD_API_URL },
  },
  resources: {
    guide: DEFAULT_GUIDE,
  },
  auth: {
    type: 'header',
    headerName: 'x-tenant-slug',
  },
})

await mcp.listen()
console.error(`MCP server running on http://0.0.0.0:${mcp.port}`)
