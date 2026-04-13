/**
 * Agent Runtime HTTP client.
 *
 * All requests to the runtime include the `X-Internal-Secret` header
 * so the runtime can verify the caller is trusted.
 */

import type { ReloadResult } from '../types'

const RELOAD_TIMEOUT_MS = 5_000

/**
 * Authenticated fetch to the agent-runtime.
 * Merges the `X-Internal-Secret` header into whatever headers the
 * caller provides.
 */
export function runtimeFetch(url: string, runtimeSecret: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('X-Internal-Secret', runtimeSecret)
  return fetch(url, { ...init, headers })
}

export async function reloadAgents(runtimeUrl: string, runtimeSecret: string): Promise<ReloadResult | null> {
  const url = `${runtimeUrl}/internal/agents/reload`

  try {
    const res = await runtimeFetch(url, runtimeSecret, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(RELOAD_TIMEOUT_MS)
    })

    if (!res.ok) {
      console.warn(`[agent-runtime] reload failed: ${res.status} ${res.statusText}`)
      return null
    }

    return (await res.json()) as ReloadResult
  } catch (err) {
    console.warn('[agent-runtime] reload request errored:', err)
    return null
  }
}
