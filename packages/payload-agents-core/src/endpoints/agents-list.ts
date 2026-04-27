/**
 * GET {basePath}/list — List public agent info for the chat UI.
 *
 * Returns only public fields (no API keys or system prompts). Access
 * filtering by tenant/role is delegated to the collection's `access.read`
 * rules — customize it via `collectionOverrides` if you need that.
 */

import type { PayloadHandler, Where } from 'payload'
import type { ResolvedPluginConfig } from '../types'

function pickStringField(record: object, field: string): string | undefined {
  if (!(field in record)) return undefined
  const value = (record as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}

function extractAvatarUrl(avatar: unknown): string | undefined {
  if (!avatar || typeof avatar !== 'object') return undefined
  if ('sizes' in avatar && avatar.sizes && typeof avatar.sizes === 'object') {
    const sizes = avatar.sizes as Record<string, unknown>
    if (sizes.avatar && typeof sizes.avatar === 'object') {
      const url = pickStringField(sizes.avatar, 'url')
      if (url) return url
    }
  }
  return pickStringField(avatar, 'url')
}

export function createAgentsListHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const where: Where = { isActive: { equals: true } }

    const { docs } = await payload.find({
      collection: config.collectionSlug,
      where,
      depth: 1,
      limit: 100,
      overrideAccess: false,
      req
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
