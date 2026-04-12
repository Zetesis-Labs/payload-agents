import type { Payload } from 'payload'

/**
 * Plugin configuration for `agentPlugin()`.
 */
export interface AgentPluginConfig {
  /**
   * Base URL of the Agno agent-runtime service.
   * @example 'http://agent-runtime:8000'
   */
  runtimeUrl: string

  /**
   * Shared secret for internal communication with the agent-runtime.
   * Sent as `X-Internal-Secret` header on reload requests.
   */
  runtimeSecret?: string

  /**
   * Token budget callback. The consumer decides the billing logic —
   * the plugin only enforces the returned limit.
   *
   * Return the maximum number of tokens the user may consume today.
   */
  getDailyLimit: (payload: Payload, userId: string | number) => Promise<number>

  /**
   * Extract a tenant identifier from the authenticated Payload user.
   * Defaults to `'default'` when not provided.
   */
  extractTenantId?: (user: Record<string, unknown>) => string

  /**
   * Override the Payload collection slug. Default: `'agents'`.
   */
  collectionSlug?: string

  /**
   * Override the endpoint base path. Default: `'/agents'`.
   *
   * All endpoints are registered under this prefix:
   * - `POST {basePath}` (chat)
   * - `GET  {basePath}/sessions`
   * - `GET/PATCH/DELETE {basePath}/session`
   * - `GET  {basePath}/agents`
   */
  basePath?: string

  /**
   * Encryption key for API keys stored in the Agents collection.
   * When provided, API keys are encrypted at rest using AES-256-GCM.
   * When omitted, API keys are stored in plaintext.
   */
  encryptionKey?: string

  /**
   * Slug of the `media` collection for agent avatars.
   * Default: `'media'`.
   */
  mediaCollectionSlug?: string

  /**
   * Slug of the taxonomy collection for RAG filtering.
   * Default: `'taxonomy'`.
   */
  taxonomyCollectionSlug?: string
}

// ── Runtime client types ──────────────────────────────────────────────────

export interface ReloadResult {
  count: number
  slugs: string[]
}

// ── Source types ───────────────────────────────────────────────────────────

export interface Source {
  id: string
  title: string
  slug: string
  type: string
}

// ── Token usage types ─────────────────────────────────────────────────────

export interface DailyTokenUsage {
  date: string
  tokens_used: number
  reset_at: string
}

export interface TokenUsageResult {
  limit: number
  used: number
  remaining: number
  percentage: number
  reset_at: string
  canUse: (tokens: number) => boolean
}

// ── Internal resolved config (all defaults applied) ───────────────────────

export interface ResolvedPluginConfig {
  runtimeUrl: string
  runtimeSecret: string
  getDailyLimit: (payload: Payload, userId: string | number) => Promise<number>
  extractTenantId: (user: Record<string, unknown>) => string
  collectionSlug: string
  basePath: string
  encryptionKey: string | undefined
  mediaCollectionSlug: string
  taxonomyCollectionSlug: string
}
