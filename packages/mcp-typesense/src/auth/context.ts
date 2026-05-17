/**
 * Per-request auth context propagation.
 *
 * The MCP Streamable HTTP transport caches a `StreamableHTTPServerTransport`
 * per session (`mcp-session-id`) and reuses it across many tool calls. The
 * tool handlers are registered once at session creation, so capturing the
 * resolved `McpAuthContext` in their closures would freeze the auth/profile
 * at the moment of `initialize` — later changes to the caller's SearchProfile
 * (or to the token's `retrievalProfile` relationship) would not apply until
 * the session is rebuilt.
 *
 * Instead, each request resolves auth from the current headers and runs the
 * transport's `handleRequest` inside an `AsyncLocalStorage` scope. Tool
 * handlers read the current auth via `getCurrentAuth()` so every invocation
 * sees fresh state.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { McpAuthContext } from '../types'

export const authStore = new AsyncLocalStorage<McpAuthContext | null>()

export function getCurrentAuth(): McpAuthContext | null {
  return authStore.getStore() ?? null
}
