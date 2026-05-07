/**
 * AG-UI passthrough stream with usage instrumentation.
 *
 * The portal BFF is a thin proxy in front of the agent-runtime: every
 * AG-UI event the runtime emits is forwarded to the browser unchanged.
 * On top of that we inject a single `CUSTOM usage` event of our own so
 * the UI can keep the budget bar in sync with the daily ledger.
 *
 * Ordering is load-bearing: AG-UI's `verifyEvents` (the SDK's runtime
 * check on the client side) requires the first event of any run to be
 * `RUN_STARTED` and the last to be `RUN_FINISHED`/`RUN_ERROR`. Anything
 * before the first or after the last is rejected. So we:
 *
 *   1. Forward every upstream event as soon as we see it, EXCEPT
 *   2. Hold the terminal `RUN_FINISHED` frame.
 *   3. Capture the runtime's `CUSTOM agno_run_completed` event during
 *      the body so we get real `RunMetrics`.
 *   4. Right before releasing the held `RUN_FINISHED`, slot in our own
 *      `CUSTOM usage` event with this run's spend folded in.
 *
 * The provider eager-loads `/usage` on mount, so the bar paints before
 * the first message — no need to prepend a usage event at the start.
 *
 * Estimation (`chars/4`) is a fallback used only when the runtime fails
 * to emit `agno_run_completed`. The fallback is tagged `source:
 * "estimate"` in the onRunCompleted payload so the canonical ledger
 * never confuses real metrics with guesses.
 */

import { effectiveTokensFromMetrics } from './token-usage'

interface UsageSnapshot {
  limit: number
  used: number
  remaining: number
  reset_at: string
}

export type OnStreamRunCompleted = (data: { metrics: Record<string, unknown>; runId?: string }) => void

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function customEventBytes(name: string, value: unknown): Uint8Array {
  const payload = {
    type: 'CUSTOM',
    timestamp: Date.now(),
    name,
    value
  }
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

function usagePayload(usage: UsageSnapshot, extraTokens = 0) {
  return {
    daily_limit: usage.limit,
    daily_used: usage.used + extraTokens,
    daily_remaining: Math.max(0, usage.remaining - extraTokens),
    reset_at: usage.reset_at
  }
}

interface AGUIEvent {
  type: string
  name?: string
  delta?: string
  runId?: string
  value?: unknown
  [key: string]: unknown
}

function parseFrame(frame: string): AGUIEvent | null {
  for (const raw of frame.split('\n')) {
    if (raw.startsWith('data: ')) {
      try {
        return JSON.parse(raw.slice(6)) as AGUIEvent
      } catch {
        return null
      }
    }
  }
  return null
}

interface AgnoRunMetrics {
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  reasoning_tokens?: number
  audio_input_tokens?: number
  audio_output_tokens?: number
  details?: unknown
  duration?: number
  time_to_first_token?: number
  [key: string]: unknown
}

function isAgnoRunMetrics(v: unknown): v is AgnoRunMetrics {
  if (typeof v !== 'object' || v === null) return false
  // Require at least one field characteristic of Agno's RunMetrics to
  // avoid misinterpreting an unrelated CUSTOM event payload as metrics.
  const o = v as Record<string, unknown>
  return typeof o.input_tokens === 'number' || typeof o.output_tokens === 'number'
}

function tokensFromMetrics(metrics: AgnoRunMetrics): number {
  const input = typeof metrics.input_tokens === 'number' ? metrics.input_tokens : 0
  const output = typeof metrics.output_tokens === 'number' ? metrics.output_tokens : 0
  const cache = typeof metrics.cache_read_tokens === 'number' ? metrics.cache_read_tokens : 0
  return effectiveTokensFromMetrics({ input_tokens: input, output_tokens: output, cache_read_tokens: cache })
}

interface StreamState {
  accumulatedChars: number
  runId?: string
  realMetrics?: AgnoRunMetrics
}

function observeContent(ev: AGUIEvent, state: StreamState): boolean {
  if (ev.type !== 'TEXT_MESSAGE_CONTENT' || typeof ev.delta !== 'string') return false
  state.accumulatedChars += ev.delta.length
  return true
}

function observeRunStarted(ev: AGUIEvent, state: StreamState): boolean {
  if (ev.type !== 'RUN_STARTED' || typeof ev.runId !== 'string') return false
  state.runId = ev.runId
  return true
}

function observeRunCompleted(ev: AGUIEvent, state: StreamState): void {
  if (ev.type !== 'CUSTOM' || ev.name !== 'agno_run_completed') return
  const v = ev.value as { metrics?: unknown; run_id?: unknown }
  if (isAgnoRunMetrics(v.metrics)) state.realMetrics = v.metrics
  if (typeof v.run_id === 'string') state.runId = v.run_id
}

function observeEvent(ev: AGUIEvent | null, state: StreamState): void {
  if (!ev || typeof ev.type !== 'string') return
  if (observeContent(ev, state)) return
  if (observeRunStarted(ev, state)) return
  observeRunCompleted(ev, state)
}

function buildMetricsPayload(state: StreamState): Record<string, unknown> {
  if (state.realMetrics) return { ...state.realMetrics, source: 'agno_run_completed' }
  return {
    estimated_output_chars: state.accumulatedChars,
    estimated_tokens: Math.ceil(state.accumulatedChars / 4),
    source: 'estimate'
  }
}

function reportRunCompleted(callback: OnStreamRunCompleted, state: StreamState): void {
  try {
    callback({ metrics: buildMetricsPayload(state), runId: state.runId })
  } catch {
    /* fire-and-forget */
  }
}

function emitErrorAndClose(controller: ReadableStreamDefaultController<Uint8Array>, err: unknown): void {
  try {
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ type: 'RUN_ERROR', message: err instanceof Error ? err.message : 'Stream error' })}\n\n`
      )
    )
  } catch {
    /* controller may already be closed */
  }
  try {
    controller.close()
  } catch {
    /* already closed */
  }
}

function flushHeldTerminal(
  controller: ReadableStreamDefaultController<Uint8Array>,
  heldTerminal: Uint8Array,
  usage: UsageSnapshot,
  state: StreamState
): void {
  // Slot the usage CUSTOM in just before the held RUN_FINISHED so it
  // lands inside the legal window for AG-UI's verifyEvents.
  const runTokens = state.realMetrics ? tokensFromMetrics(state.realMetrics) : Math.ceil(state.accumulatedChars / 4)
  controller.enqueue(customEventBytes('usage', usagePayload(usage, runTokens)))
  controller.enqueue(heldTerminal)
}

export function passthroughAguiStream(
  upstreamBody: ReadableStream<Uint8Array>,
  usage: UsageSnapshot,
  onRunCompleted?: OnStreamRunCompleted
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const state: StreamState = { accumulatedChars: 0 }
      let buffer = ''
      let heldTerminal: Uint8Array | null = null

      const handleFrame = (frameWithSeparator: string) => {
        const frameBody = frameWithSeparator.endsWith('\n\n') ? frameWithSeparator.slice(0, -2) : frameWithSeparator
        const ev = parseFrame(frameBody)
        if (ev?.type === 'RUN_FINISHED') {
          heldTerminal = encoder.encode(frameWithSeparator)
          return
        }
        observeEvent(ev, state)
        controller.enqueue(encoder.encode(frameWithSeparator))
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let frameEnd = buffer.indexOf('\n\n')
          while (frameEnd !== -1) {
            const frame = buffer.slice(0, frameEnd + 2)
            buffer = buffer.slice(frameEnd + 2)
            handleFrame(frame)
            frameEnd = buffer.indexOf('\n\n')
          }
        }

        // Trailing frame without `\n\n` (rare, defensive).
        if (buffer.trim()) handleFrame(`${buffer}\n\n`)

        if (heldTerminal) flushHeldTerminal(controller, heldTerminal, usage, state)

        controller.close()

        if (onRunCompleted) reportRunCompleted(onRunCompleted, state)
      } catch (err) {
        emitErrorAndClose(controller, err)
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } catch {
        /* ignore */
      }
    }
  })
}
