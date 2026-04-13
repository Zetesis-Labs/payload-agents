/**
 * GET {basePath}/sessions — List chat sessions for the authenticated user.
 *
 * Proxies to Agno `GET /sessions?type=agent&user_id=…`.
 */

import type { PayloadHandler } from 'payload'
import type { ResolvedPluginConfig } from '../types'

export function createSessionsListHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (user as unknown as { id: string | number }).id
    const url = new URL(req.url || '', 'http://localhost')
    const agentSlug = url.searchParams.get('agentSlug')

    const params = new URLSearchParams({
      type: 'agent',
      user_id: String(userId),
      sort_by: 'updated_at',
      sort_order: 'desc',
      limit: String(Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 20), 100)),
      page: url.searchParams.get('page') || '1'
    })
    if (agentSlug) {
      params.set('component_id', agentSlug)
    }

    try {
      const res = await fetch(`${config.runtimeUrl}/sessions?${params}`, {
        signal: AbortSignal.timeout(5_000)
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error(`[chat/sessions] agent-runtime returned ${res.status}: ${text}`)
        return Response.json({ sessions: [] })
      }

      const body = (await res.json()) as {
        data: Array<{
          session_id: string
          session_name: string
          agent_id?: string
          created_at?: string
          updated_at?: string
        }>
      }

      const sessions = (body.data || []).map(s => ({
        conversation_id: s.session_id,
        title: s.session_name || undefined,
        last_activity: s.updated_at || s.created_at || '',
        status: 'active',
        agentSlug: s.agent_id
      }))

      return Response.json({ sessions })
    } catch (err) {
      console.error('[chat/sessions] fetch failed:', err)
      return Response.json({ sessions: [] })
    }
  }
}
