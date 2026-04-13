/**
 * Default tenant extraction from a Payload user object.
 *
 * Users have a `tenants` array field via the multi-tenant plugin;
 * each entry is `{ tenant: number | { id: number } }`.
 * We take the first one; fallback to `'default'` for users without tenants.
 */
export function defaultExtractTenantId(user: Record<string, unknown>): string {
  const tenants = user.tenants as Array<{ tenant: number | { id: number } }> | undefined | null
  if (!tenants?.[0]) return 'default'
  const t = tenants[0].tenant
  return String(typeof t === 'object' && t !== null ? t.id : t)
}
