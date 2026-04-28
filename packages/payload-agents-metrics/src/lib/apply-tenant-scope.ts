import type { AccessResult, ResolvedMetricsConfig } from '../types'
import type { BaseFilters } from './build-where'

export function applyTenantScope(
  filters: BaseFilters,
  config: ResolvedMetricsConfig,
  access: AccessResult,
  tenantIdParam: string | null
): void {
  if (!access) return
  if (!config.multiTenant) return

  if ('allTenants' in access) {
    if (tenantIdParam) filters.tenantId = tenantIdParam
    return
  }

  const allowedTenantId = tenantIdParam && access.tenantIds.includes(Number(tenantIdParam)) ? tenantIdParam : null
  if (allowedTenantId) {
    filters.tenantId = allowedTenantId
  } else {
    filters.tenantIds = access.tenantIds
  }
}
