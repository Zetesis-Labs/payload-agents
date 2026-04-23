import type { Config, Plugin } from 'payload'
import { createLlmUsageEventsCollection } from './collections/llm-usage-events'
import { createAggregateHandler } from './endpoints/aggregate'
import { createIngestHandler } from './endpoints/ingest'
import { createSessionDetailHandler } from './endpoints/session-detail'
import { createSessionsHandler } from './endpoints/sessions'
import { createOnRunCompleted } from './lib/on-run-completed'
import type { MetricsPluginConfig, ResolvedMetricsConfig } from './types'

/** Default access: any authenticated user can read all data. */
const defaultCheckAccess = async (): Promise<{ allTenants: true }> => ({ allTenants: true })

/** Default tenant resolver: returns null (no tenant). */
const defaultResolveTenantId = async (): Promise<null> => null

function resolveConfig(userConfig: MetricsPluginConfig): ResolvedMetricsConfig {
  const multiTenant = userConfig.multiTenant ?? true
  return {
    multiTenant,
    checkAccess: userConfig.checkAccess ?? defaultCheckAccess,
    resolveTenantId: userConfig.resolveTenantId ?? defaultResolveTenantId,
    basePath: userConfig.basePath ?? '/metrics',
    ingestSecret: userConfig.ingestSecret ?? process.env.AGNO_INTERNAL_SECRET ?? 'dev',
    collectionSlug: userConfig.collectionSlug ?? 'llm-usage-events',
    usersSlug: userConfig.usersSlug ?? 'users',
    tenantsSlug: userConfig.tenantsSlug ?? 'tenants',
    agentsSlug: userConfig.agentsSlug ?? 'agents',
    collectionOverrides: userConfig.collectionOverrides,
    extraPricing: userConfig.extraPricing ?? {},
    agnoSessionsTable: userConfig.agnoSessionsTable ?? 'agno.agno_sessions'
  }
}

interface MetricsPluginResult extends Plugin {
  /** Callback for `agentPlugin({ onRunCompleted })`. */
  onRunCompleted: ReturnType<typeof createOnRunCompleted>
}

export function metricsPlugin(userConfig: MetricsPluginConfig): MetricsPluginResult {
  const config = resolveConfig(userConfig)
  const basePath = config.basePath

  const plugin = ((incomingConfig: Config): Config => {
    const collection = createLlmUsageEventsCollection(config)

    const endpoints = [
      { path: `${basePath}/ingest`, method: 'post' as const, handler: createIngestHandler(config) },
      { path: `${basePath}/aggregate`, method: 'get' as const, handler: createAggregateHandler(config) },
      { path: `${basePath}/sessions`, method: 'get' as const, handler: createSessionsHandler(config) },
      { path: `${basePath}/session`, method: 'get' as const, handler: createSessionDetailHandler(config) }
    ]

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), collection],
      endpoints: [...(incomingConfig.endpoints ?? []), ...endpoints]
    }
  }) as MetricsPluginResult

  plugin.onRunCompleted = createOnRunCompleted(config)

  return plugin
}
