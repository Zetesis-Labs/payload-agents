/**
 * GET {basePath}/list — List public agent info for the chat UI.
 *
 * Returns only public fields (no API keys or system prompts).
 * Filtered by the user's tenant when `extractTenantId` is provided.
 */

import type { PayloadHandler, Where } from 'payload'
import type { ResolvedPluginConfig } from '../types'

function extractAvatarUrl(avatar: unknown): string | undefined {
  if (!avatar || typeof avatar !== 'object') return undefined
  const media = avatar as Record<string, unknown>
  const sizes = media.sizes as Record<string, { url?: string }> | undefined
  return sizes?.avatar?.url ?? (media.url as string | undefined) ?? undefined
}

export function createAgentsListHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = config.extractTenantId(user as unknown as Record<string, unknown>)
    const where: Where = { isActive: { equals: true } }
    if (tenantId !== 'default') {
      where.tenant = { equals: tenantId }
    }

    const { docs } = await payload.find({
      collection: config.collectionSlug,
      where,
      depth: 1,
      limit: 100
    })

    const agents = docs.map((a: Record<string, unknown>) => ({
      slug: a.slug,
      name: a.name,
      welcomeTitle: a.welcomeTitle ?? undefined,
      welcomeSubtitle: a.welcomeSubtitle ?? undefined,
      suggestedQuestions: (a.suggestedQuestions as Array<Record<string, unknown>> | undefined)?.map(q => ({
        prompt: q.prompt,
        title: q.title,
        description: q.description || ''
      })),
      avatar: extractAvatarUrl(a.avatar)
    }))

    return Response.json({ agents })
  }
}
