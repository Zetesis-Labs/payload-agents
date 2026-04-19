/**
 * Agent Runtime HTTP client.
 *
 * All requests to the runtime include the `X-Internal-Secret` header
 * so the runtime can verify the caller is trusted.
 *
 * Reloads are not pushed from here: the Agents collection hooks fan out
 * via Postgres `NOTIFY agent_reload` and every runtime replica listens
 * on that channel. The HTTP `/internal/agents/reload` endpoint on the
 * runtime stays for manual `curl` debugging, but there's no TS client
 * helper for it — the old one only reached a single replica via the K8s
 * Service round-robin, which was the bug it was supposed to work around.
 */

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
