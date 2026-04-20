import type { CollectionConfig, Payload, TypedUser } from 'payload'

/**
 * Access check result returned by the consumer's `checkAccess` callback.
 *
 * - `{ allTenants: true }` — user can see all data (superadmin).
 * - `{ tenantIds: [...] }` — user scoped to specific tenants.
 * - `null` — access denied (403).
 */
export type AccessResult = { allTenants: true } | { tenantIds: Array<number | string> } | null

/**
 * Plugin configuration for `metricsPlugin()`.
 */
export interface MetricsPluginConfig {
  /**
   * Enable multi-tenant scoping. Default: `true`.
   *
   * When `false`, the collection has no `tenant` field, endpoints don't
   * filter by tenant, and `checkAccess` / `resolveTenantId` are ignored.
   * Access defaults to any authenticated user.
   */
  multiTenant?: boolean

  /**
   * Determine what the current user can see.
   * Called on every read endpoint (aggregate, sessions, session detail).
   * **Required when `multiTenant` is `true`.**
   */
  checkAccess?: (payload: Payload, user: TypedUser) => Promise<AccessResult> | AccessResult

  /**
   * Resolve the tenant ID for a given user when persisting usage events.
   * Called by the `onRunCompleted` callback.
   * **Required when `multiTenant` is `true`.**
   */
  resolveTenantId?: (payload: Payload, userId: string | number) => Promise<number | string | null>

  /** Base path for all endpoints. Default: `'/metrics'`. */
  basePath?: string

  /** Shared secret for the ingest endpoint. Default: `env.AGNO_INTERNAL_SECRET || 'dev'`. */
  ingestSecret?: string

  /** Collection slug. Default: `'llm-usage-events'`. */
  collectionSlug?: string

  /** Users collection slug. Default: `'users'`. */
  usersSlug?: string

  /** Tenants collection slug. Default: `'tenants'`. */
  tenantsSlug?: string

  /** Agents collection slug. Default: `'agents'`. */
  agentsSlug?: string

  /** Transform the collection config before registration. */
  collectionOverrides?: (current: CollectionConfig) => CollectionConfig

  /** Extra model pricing (merged with built-in table). `{ input, output }` in USD per token. */
  extraPricing?: Record<string, { input: number; output: number }>
}

/** Internal resolved config with all defaults applied. */
export interface ResolvedMetricsConfig {
  multiTenant: boolean
  checkAccess: (payload: Payload, user: Record<string, unknown>) => Promise<AccessResult> | AccessResult
  resolveTenantId: (payload: Payload, userId: string | number) => Promise<number | string | null>
  basePath: string
  ingestSecret: string
  collectionSlug: string
  usersSlug: string
  tenantsSlug: string
  agentsSlug: string
  collectionOverrides: MetricsPluginConfig['collectionOverrides']
  extraPricing: Record<string, { input: number; output: number }>
}
