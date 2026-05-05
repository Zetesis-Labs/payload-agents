import type { PayloadHandler } from 'payload'
import { getFilterOptions } from '../lib/filter-options-query'
import type { ResolvedMetricsConfig } from '../types'

export function createFilterOptionsHandler(config: ResolvedMetricsConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await config.checkAccess(payload, user)
    if (!access) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url || '', 'http://localhost')
    const field = url.searchParams.get('field')
    const q = (url.searchParams.get('q') ?? '').trim()
    const tenantIdParam = url.searchParams.get('tenantId')

    const result = await getFilterOptions(payload, config, user, access, tenantIdParam, field, q)
    if (!result) return Response.json({ error: 'Invalid field. Use: agent, user, model' }, { status: 400 })

    return Response.json(result)
  }
}
