/**
 * Centralized MCP sampling helper.
 *
 * The MCP protocol lets a server ask the connected client to run an LLM
 * completion on its behalf (`sampling/createMessage`). This module is the
 * single choke point through which every synthesis tool in this package
 * reaches that capability. Tools MUST NOT call `server.server.createMessage`
 * directly — they go through `requestSampling` / `requestStructuredSampling`
 * so that capability checks, timeouts, abort propagation, output validation,
 * and error shaping are handled uniformly.
 *
 * Fallback contract: if the client does not advertise the `sampling`
 * capability during `initialize`, the tools that use this helper return a
 * `samplingNotSupportedError(...)` object as data (never throw). The caller
 * is expected to read the `fallback` field and follow the suggested tool.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type {
  CreateMessageRequestParamsBase,
  CreateMessageResult,
  ModelPreferences
} from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'

// ============================================================================
// ERRORS
// ============================================================================

export type SamplingErrorCode = 'NOT_SUPPORTED' | 'TIMEOUT' | 'CANCELLED' | 'INVALID_OUTPUT' | 'CLIENT_ERROR'

export class SamplingError extends Error {
  code: SamplingErrorCode
  override cause?: unknown

  constructor(code: SamplingErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'SamplingError'
    this.code = code
    this.cause = cause
  }
}

// ============================================================================
// CAPABILITY CHECK
// ============================================================================

/**
 * True iff the connected client declared `sampling` in its capabilities
 * during `initialize`. Tools should short-circuit to `samplingNotSupportedError`
 * when this returns false.
 */
export function hasSamplingCapability(server: McpServer): boolean {
  const caps = server.server.getClientCapabilities()
  return !!caps?.sampling
}

// ============================================================================
// REQUEST SHAPES
// ============================================================================

export interface SamplingRequest {
  /** System prompt (instructions the model must follow). */
  system: string
  /** The user turn. Chunk text should be wrapped as XML tags — see prompts/shared.ts. */
  user: string
  /** Hard cap on tokens the model may emit. */
  maxTokens: number
  /** Temperature. Default 0.3 — we want focused synthesis, not creativity. */
  temperature?: number
  /** Model routing hints (speed vs intelligence). Client honors at its discretion. */
  modelPreferences?: ModelPreferences
  /** Per-request timeout in ms. Default 90000 (sampling calls are slow). */
  timeoutMs?: number
}

export interface SamplingResponse {
  text: string
  model: string
  stopReason?: string
}

const DEFAULT_TEMPERATURE = 0.3
const DEFAULT_TIMEOUT_MS = 90_000

// ============================================================================
// RAW TEXT SAMPLING
// ============================================================================

/**
 * Low-level sampling call. Returns raw text from the client's model.
 * Throws {@link SamplingError} on any failure — never returns undefined.
 *
 * Callers should catch SamplingError and shape it into a tool error object.
 */
export async function requestSampling(
  server: McpServer,
  req: SamplingRequest,
  signal?: AbortSignal
): Promise<SamplingResponse> {
  if (!hasSamplingCapability(server)) {
    throw new SamplingError('NOT_SUPPORTED', 'Client does not support the sampling capability.')
  }

  const params: CreateMessageRequestParamsBase = {
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: req.user }
      }
    ],
    systemPrompt: req.system,
    maxTokens: req.maxTokens,
    temperature: req.temperature ?? DEFAULT_TEMPERATURE,
    includeContext: 'none'
  }
  if (req.modelPreferences) {
    params.modelPreferences = req.modelPreferences
  }

  let result: CreateMessageResult
  try {
    result = await server.server.createMessage(params, {
      signal,
      timeout: req.timeoutMs ?? DEFAULT_TIMEOUT_MS
    })
  } catch (err) {
    throw wrapTransportError(err)
  }

  if (result.content.type !== 'text') {
    throw new SamplingError('INVALID_OUTPUT', `Expected text response, received content type: ${result.content.type}`)
  }

  return {
    text: result.content.text,
    model: result.model,
    stopReason: result.stopReason
  }
}

function wrapTransportError(err: unknown): SamplingError {
  if (err instanceof SamplingError) return err
  const e = err as { name?: string; code?: string | number; message?: string } | null
  if (e?.name === 'AbortError') {
    return new SamplingError('CANCELLED', 'Sampling request was cancelled by the client.', err)
  }
  // McpError with RequestTimeout is numeric code -32001 in the SDK, but we also
  // accept the string form for robustness against SDK shape changes.
  if (e?.code === 'RequestTimeout' || e?.code === -32001) {
    return new SamplingError('TIMEOUT', 'Sampling request timed out waiting for the client.', err)
  }
  const msg = e?.message ?? 'Unknown sampling transport error.'
  // Capability errors raised by the SDK itself when client lacks `sampling`.
  if (/does not support.*sampling/i.test(msg)) {
    return new SamplingError('NOT_SUPPORTED', msg, err)
  }
  return new SamplingError('CLIENT_ERROR', msg, err)
}

// ============================================================================
// STRUCTURED (JSON) SAMPLING
// ============================================================================

/**
 * Sampling call that expects a JSON response matching the given Zod schema.
 *
 * Robustness strategy:
 * 1. Issue the first call with the caller's temperature.
 * 2. Extract a JSON object from the response (raw or inside a ```json fence).
 * 3. Validate with the schema.
 * 4. On any failure above, retry ONCE with temperature 0 and a stricter system
 *    prompt suffix demanding JSON-only output.
 * 5. If the retry also fails, throw SamplingError('INVALID_OUTPUT') including
 *    the raw text of the last attempt in the `cause` for debugging.
 */
export async function requestStructuredSampling<T>(
  server: McpServer,
  req: SamplingRequest,
  schema: z.ZodType<T>,
  signal?: AbortSignal
): Promise<{ data: T; model: string; raw: string }> {
  const first = await tryStructured(server, req, schema, signal)
  if (first.ok) return { data: first.data, model: first.model, raw: first.raw }

  // Retry once with temperature 0 and a hardened system prompt.
  const hardened: SamplingRequest = {
    ...req,
    temperature: 0,
    system: `${req.system}\n\nCRITICAL: Return ONLY a raw JSON object matching the schema. No prose, no markdown fences, no commentary. Your entire response must be valid JSON parseable by JSON.parse().`
  }
  const second = await tryStructured(server, hardened, schema, signal)
  if (second.ok) return { data: second.data, model: second.model, raw: second.raw }

  throw new SamplingError('INVALID_OUTPUT', `Model returned invalid structured output after retry: ${second.reason}`, {
    rawFirst: first.raw,
    rawSecond: second.raw,
    zodErrorFirst: first.reason,
    zodErrorSecond: second.reason
  })
}

type StructuredAttempt<T> =
  | { ok: true; data: T; model: string; raw: string }
  | { ok: false; raw: string; reason: string; model: string }

async function tryStructured<T>(
  server: McpServer,
  req: SamplingRequest,
  schema: z.ZodType<T>,
  signal?: AbortSignal
): Promise<StructuredAttempt<T>> {
  const res = await requestSampling(server, req, signal)
  const raw = res.text
  const extracted = extractJson(raw)
  if (!extracted) {
    return { ok: false, raw, reason: 'No JSON object found in response.', model: res.model }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(extracted) as unknown
  } catch (err) {
    return {
      ok: false,
      raw,
      reason: `JSON.parse failed: ${(err as Error).message}`,
      model: res.model
    }
  }

  const validated = schema.safeParse(parsed)
  if (!validated.success) {
    return {
      ok: false,
      raw,
      reason: `Schema validation failed: ${validated.error.message}`,
      model: res.model
    }
  }
  return { ok: true, data: validated.data, model: res.model, raw }
}

/**
 * Extract the outermost JSON object (or array) from a model response that
 * may or may not be wrapped in markdown fences or contain prose.
 */
function extractJson(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) return fenceMatch[1].trim()

  const firstObj = trimmed.indexOf('{')
  const firstArr = trimmed.indexOf('[')
  let start = -1
  if (firstObj === -1) start = firstArr
  else if (firstArr === -1) start = firstObj
  else start = Math.min(firstObj, firstArr)

  if (start === -1) return null

  const open = trimmed[start]
  const close = open === '{' ? '}' : ']'
  const end = trimmed.lastIndexOf(close)
  if (end <= start) return null
  return trimmed.slice(start, end + 1)
}

// ============================================================================
// FALLBACK HELPER
// ============================================================================

export interface SamplingNotSupportedError {
  error: 'sampling_not_supported'
  message: string
  fallback: {
    tool: string
    suggested_call: Record<string, unknown>
    reason: string
  }
}

/**
 * Standard response all three synthesis tools return when the client does
 * not support sampling. The shape is uniform so the agent can recognize it
 * and route to the fallback tool without per-tool branching.
 */
export function samplingNotSupportedError(fallback: {
  tool: string
  suggested_call: Record<string, unknown>
  reason: string
}): SamplingNotSupportedError {
  return {
    error: 'sampling_not_supported',
    message:
      'Your MCP client does not support LLM sampling. This synthesis tool cannot run. Call the suggested fallback tool and compose the result yourself from the returned chunks.',
    fallback
  }
}
