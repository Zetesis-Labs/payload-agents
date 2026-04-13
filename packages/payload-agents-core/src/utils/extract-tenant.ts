/**
 * Default tenant extraction from a Payload request.
 *
 * 1. Reads the `payload-tenant` cookie set by the multi-tenant plugin
 *    (this is the tenant the user actively selected in the UI).
 * 2. Falls back to the first entry in the user's `tenants` array.
 * 3. Returns `'default'` for users without tenants.
 */
export function defaultExtractTenantId(
  user: Record<string, unknown>,
  req: { headers: { get: (name: string) => string | null } }
): string {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)payload-tenant=(\d+)/)
  if (match?.[1]) return match[1]

  const tenants = user.tenants as Array<{ tenant: number | { id: number } }> | undefined | null
  if (!tenants?.[0]) return 'default'
  const t = tenants[0].tenant
  return String(typeof t === 'object' && t !== null ? t.id : t)
}
