/**
 * @zetesis/mcp-typesense
 *
 * Composable MCP (Model Context Protocol) server that exposes Typesense-backed
 * content with taxonomy enrichment, LLM sampling synthesis tools, and
 * pluggable auth.
 *
 * ## Quickstart
 *
 * ```ts
 * import { createMcpServer } from '@zetesis/mcp-typesense'
 *
 * const mcp = createMcpServer({
 *   server: { name: 'my-search', version: '1.0.0' },
 *   transport: { port: 3001 },
 *   typesense: {
 *     host: '127.0.0.1',
 *     port: 8108,
 *     protocol: 'http',
 *     apiKey: 'xyz',
 *   },
 *   embeddings: {
 *     provider: 'openai',
 *     apiKey: process.env.OPENAI_API_KEY!,
 *     model: 'text-embedding-3-small',
 *     dimensions: 1536,
 *   },
 *   collections: [
 *     {
 *       key: 'posts',
 *       displayName: 'Posts',
 *       chunkCollection: 'posts_chunk',
 *       parentCollection: 'posts',
 *       chunkSearchFields: ['chunk_text', 'title'],
 *       chunkFacetFields: ['tenant', 'taxonomy_slugs'],
 *       kind: 'document',
 *     },
 *   ],
 *   taxonomy: {
 *     source: { type: 'payload-rest', baseUrl: 'http://localhost:3000' },
 *   },
 * })
 *
 * await mcp.listen()
 * console.log(`MCP server listening on :${mcp.port}`)
 * ```
 */

// Defaults — exposed so consumers can extend them
export { DEFAULT_GUIDE, DEFAULT_INSTRUCTIONS } from './defaults'
// Main factory
export { createMcpServer } from './server'
// Public config types
export type {
  // Collections
  ChunkCollectionConfig,
  ChunkCollectionKind,
  // Content
  ContentConfig,
  ContentSource,
  // Embeddings
  EmbeddingConfig,
  // Features
  FeaturesConfig,
  FetchBooksParams,
  // Auth
  McpAuthContext,
  McpAuthStrategy,
  // Core
  McpServerConfig,
  McpServerHandle,
  RawBookDoc,
  // Taxonomy
  RawTaxonomyDoc,
  ResourcesConfig,
  ServerInfoConfig,
  TaxonomyConfig,
  TaxonomySource,
  ToolNameOverrides,
  TransportConfig,
  TypesenseConnectionConfig
} from './types'
