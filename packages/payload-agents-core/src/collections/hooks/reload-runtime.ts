/**
 * Hooks that tell the agent runtime to refresh its in-memory registry
 * after an Agent is created, updated, or deleted.
 *
 * Best-effort: failures are logged but not thrown — the runtime self-heals
 * on next restart via its FastAPI lifespan hook.
 */

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { reloadAgents } from '../../lib/runtime-client'
import type { ResolvedPluginConfig } from '../../types'

export function createAfterChangeHook(config: ResolvedPluginConfig): CollectionAfterChangeHook {
  return async ({ doc, operation }) => {
    const slug = (doc as Record<string, unknown>).slug as string
    console.log(`[Agents] ${operation} → triggering agent-runtime reload for "${slug}"`)
    const result = await reloadAgents(config.runtimeUrl, config.runtimeSecret)
    if (result) {
      console.log(`[Agents] runtime registry now holds ${result.count} agents`)
    }
    return doc
  }
}

export function createAfterDeleteHook(config: ResolvedPluginConfig): CollectionAfterDeleteHook {
  return async ({ doc }) => {
    const slug = (doc as Record<string, unknown>).slug as string
    console.log(`[Agents] delete → triggering agent-runtime reload (removed "${slug}")`)
    await reloadAgents(config.runtimeUrl, config.runtimeSecret)
    return doc
  }
}
