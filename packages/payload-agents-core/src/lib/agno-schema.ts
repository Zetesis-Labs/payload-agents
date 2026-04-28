/**
 * Shared Zod schemas for the Agno agent-runtime API surface.
 *
 * Single source of truth — both `payload-agents-core` (sse-translator,
 * session endpoints) and `payload-agents-metrics` (session detail
 * dashboard) parse Agno responses through these schemas instead of
 * hand-rolling local interfaces and `as` casts.
 *
 * The full Agno OpenAPI lives at `services/agent-runtime/.../openapi.json`
 * — when Agno's API surface changes meaningfully, regenerate or extend
 * these schemas to match. We deliberately model only the fields we
 * consume; anything we don't read is left as untyped passthrough.
 */

import { z } from 'zod'

// ── Tool calls ────────────────────────────────────────────────────────────

export const AgnoToolCallSchema = z.object({
  id: z.string(),
  function: z.object({
    name: z.string(),
    arguments: z.string()
  })
})

// ── Messages ──────────────────────────────────────────────────────────────

export const AgnoMessageSchema = z.object({
  role: z.string(),
  content: z.string().nullable().optional(),
  tool_name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(AgnoToolCallSchema).optional()
})

// ── Runs ──────────────────────────────────────────────────────────────────

export const AgnoRunSchema = z.object({
  messages: z.array(AgnoMessageSchema).optional()
})

// ── Session detail ────────────────────────────────────────────────────────

export const AgnoSessionDetailSchema = z.object({
  session_id: z.string(),
  session_name: z.string(),
  agent_id: z.string().optional(),
  chat_history: z.array(AgnoMessageSchema).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
})

// ── SSE event shapes (Agno streaming wire format) ─────────────────────────
//
// Internal — the SSE translator reads these fields off arbitrary JSON
// frames. We keep them as TS interfaces (no Zod) because the SSE pipe is
// hot-path and the field-by-field guards in the translator already protect
// against malformed inputs. Declaring the shapes here avoids the
// `parsed.tool as Record<string, unknown>` cast at every call site.

export interface AgnoSseTool {
  tool_call_id?: string
  tool_name?: string
  tool_args?: unknown
  result?: unknown
}

export interface AgnoSseMetrics {
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  total_tokens?: number
  duration?: number
  reasoning_tokens?: number
  /**
   * Index signature so consumers (e.g. `RunCompletedContext.metrics`) keep
   * generic field access without the package having to enumerate every
   * Agno metric. Known fields are typed; unknown ones are `unknown`.
   */
  [key: string]: unknown
}

export interface AgnoSseFrame {
  event?: string
  content?: string
  run_id?: string
  tool?: AgnoSseTool
  metrics?: AgnoSseMetrics
}

// ── Inferred types — keep schema and type in lockstep ─────────────────────

export type AgnoToolCall = z.infer<typeof AgnoToolCallSchema>
export type AgnoMessage = z.infer<typeof AgnoMessageSchema>
export type AgnoRun = z.infer<typeof AgnoRunSchema>
export type AgnoSessionDetail = z.infer<typeof AgnoSessionDetailSchema>

// ── Boundary parsers ──────────────────────────────────────────────────────

/**
 * Parse an unknown value as an Agno session detail. Returns `null` when
 * the value doesn't match the schema — callers decide what to do (404,
 * empty response, etc.).
 */
export function parseAgnoSession(value: unknown): AgnoSessionDetail | null {
  const result = AgnoSessionDetailSchema.safeParse(value)
  return result.success ? result.data : null
}

/**
 * Parse an unknown value as an array of Agno runs. Returns `[]` when the
 * value doesn't match — keeps endpoint handlers simple (no need to
 * propagate parse errors as 5xx).
 */
export function parseAgnoRuns(value: unknown): AgnoRun[] {
  const result = z.array(AgnoRunSchema).safeParse(value)
  return result.success ? result.data : []
}

/**
 * Walk runs and return their messages flattened. Convenience helper for
 * the `/sessions/{id}/runs` consumers that don't care about run-level
 * grouping.
 */
export function extractMessagesFromRuns(runs: AgnoRun[]): AgnoMessage[] {
  return runs.flatMap(r => r.messages ?? [])
}
