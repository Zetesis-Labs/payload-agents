/**
 * Agent Runtime HTTP client.
 *
 * Thin wrapper around the internal HTTP API exposed by the Python
 * agent-runtime service. Used by Payload hooks to tell the runtime
 * to refresh its in-memory agent registry.
 */

import type { ReloadResult } from '../types'

const RELOAD_TIMEOUT_MS = 5_000

export async function reloadAgents(runtimeUrl: string, runtimeSecret: string): Promise<ReloadResult | null> {
  const url = `${runtimeUrl}/internal/agents/reload`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Internal-Secret': runtimeSecret,
        'Content-Type': 'application/json'
      },
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
