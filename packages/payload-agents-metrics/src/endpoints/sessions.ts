import type { PayloadHandler } from 'payload'
import { applyTenantScope } from '../lib/apply-tenant-scope'
import { getSessions, type SessionFilters } from '../lib/sessions-query'
import type { ResolvedMetricsConfig } from '../types'

export function createSessionsHandler(config: ResolvedMetricsConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await config.checkAccess(payload, user)
    if (!access) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url || '', 'http://localhost')
    const from = url.searchParams.get('from') ?? undefined
    const to = url.searchParams.get('to') ?? undefined
    const tenantIdParam = url.searchParams.get('tenantId')
    const agentSlug = url.searchParams.get('agentSlug') ?? undefined
    const userId = url.searchParams.get('userId') ?? undefined
    const model = url.searchParams.get('model') ?? undefined
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))

    const filters: SessionFilters = { from, to, agentSlug, userId, model }
    applyTenantScope(filters, config, access, tenantIdParam)

    const result = await getSessions(payload, config, filters, page)
    return Response.json(result)
  }
}
