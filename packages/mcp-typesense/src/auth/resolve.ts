/**
 * Auth resolution. Given an incoming request and the configured strategy,
 * return an `McpAuthContext` (or null for no scope).
 *
 * Phase A ships a single strategy (`header`). The discriminated union is
 * already in place so new strategies (`callback`, `none`) can be added
 * additively without breaking consumers.
 */

import type { IncomingMessage } from 'node:http'
import type { McpAuthContext, McpAuthStrategy } from '../types'

const DEFAULT_HEADER_NAME = 'x-tenant-slug'
const TAXONOMY_HEADER_NAME = 'x-taxonomy-slugs'

export function resolveAuth(req: IncomingMessage, strategy: McpAuthStrategy | undefined): McpAuthContext | null {
  // Default strategy: header with default header name.
  const effective: McpAuthStrategy = strategy ?? { type: 'header' }

  if (effective.type === 'header') {
    const headerName = (effective.headerName ?? DEFAULT_HEADER_NAME).toLowerCase()
    const raw = req.headers[headerName]
    const tenantSlug = Array.isArray(raw) ? raw[0] : raw

    // Optional: taxonomy slugs for server-enforced content scoping
    const taxonomyRaw = req.headers[TAXONOMY_HEADER_NAME]
    const taxonomyStr = Array.isArray(taxonomyRaw) ? taxonomyRaw[0] : taxonomyRaw
    const taxonomySlugs = taxonomyStr
      ? taxonomyStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : undefined

    // Single-tenant deploys (no tenant header) can still send taxonomy
    // filters. Return a context whenever at least one of the two is present;
    // null means "no auth headers at all" → no auto-scoping.
    if (!tenantSlug && !taxonomySlugs?.length) return null

    return { tenantSlug: tenantSlug || undefined, taxonomySlugs }
  }

  // Exhaustive guard. When new variants are added, TypeScript will force
  // handling them here instead of silently returning null.
  const _exhaustive: never = effective
  return _exhaustive
}
