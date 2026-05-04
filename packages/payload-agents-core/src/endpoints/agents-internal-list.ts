/**
 * GET /api/{collectionSlug}/internal/list — internal endpoint the agent
 * runtime calls to fetch all active agents (with decrypted apiKey + populated
 * tenant + populated taxonomies). Authenticated by `X-Internal-Secret`,
 * scoped to active agents, calls Payload's local API with `overrideAccess:
 * true` so the host's collection access can stay honestly user-scoped.
 *
 * Replaces the previous flow where the runtime hit `GET /api/agents` with
 * `X-Runtime-Secret` and the host had to bypass `read` access on both the
 * agents and tenants collections to make depth=1 populate work.
 */

import type { PayloadHandler, PayloadRequest, Where } from 'payload'
import type { ResolvedPluginConfig } from '../types'

const INTERNAL_SECRET_HEADER = 'x-internal-secret'

const requireInternalSecret = (req: PayloadRequest, internalSecret: string): Response | null => {
  if (!internalSecret) {
    return Response.json({ error: 'Internal endpoint not configured' }, { status: 503 })
  }
  const headerSecret = req.headers?.get?.(INTERNAL_SECRET_HEADER)
  if (!headerSecret || headerSecret !== internalSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export function createAgentsInternalListHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const authError = requireInternalSecret(req, config.runtimeSecret)
    if (authError) return authError

    const where: Where = { isActive: { equals: true } }

    // `context.internalAgentRead` tells the apiKey afterRead hook to decrypt;
    // `overrideAccess: true` skips the host's collection access (and the
    // populated tenant/taxonomies relations) so we don't need bypass branches
    // in the host's collection access functions.
    const { docs } = await req.payload.find({
      collection: config.collectionSlug,
      where,
      depth: 1,
      limit: 1000,
      overrideAccess: true,
      req,
      context: { internalAgentRead: true }
    })

    return Response.json({ docs })
  }
}
