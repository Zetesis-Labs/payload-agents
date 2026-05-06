/**
 * AG-UI passthrough stream with usage instrumentation.
 *
 * The portal BFF is a thin proxy in front of the agent-runtime: every
 * AG-UI event the runtime emits is forwarded to the browser unchanged.
 * On top of that we inject `CUSTOM usage` events of our own so the UI
 * can render the budget bar:
 *
 *   - prepended at run start: snapshot of the user's daily budget as it
 *     stood when the request was authorised.
 *   - appended after RUN_FINISHED: same snapshot updated with this
 *     run's cost.
 *
 * Run cost comes from the runtime's own `CUSTOM agno_run_completed`
 * event (real Agno `RunMetrics`: input_tokens, output_tokens,
 * cache_read_tokens, etc.). When the runtime fails to emit it — older
 * deployments, malformed events, etc. — we fall back to an estimate
 * derived from accumulated text content. The fallback keeps the UI
 * functional but is not authoritative for billing.
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

function customEvent(name: string, value: unknown): Uint8Array {
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

function tryParseEvent(frame: string): AGUIEvent | null {
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
  return typeof v === 'object' && v !== null
}

function tokensFromMetrics(metrics: AgnoRunMetrics): number {
  const input = typeof metrics.input_tokens === 'number' ? metrics.input_tokens : 0
  const output = typeof metrics.output_tokens === 'number' ? metrics.output_tokens : 0
  const cache = typeof metrics.cache_read_tokens === 'number' ? metrics.cache_read_tokens : 0
  return effectiveTokensFromMetrics({ input_tokens: input, output_tokens: output, cache_read_tokens: cache })
}

/**
 * Wrap the runtime's AG-UI byte stream:
 *   1. Emit `CUSTOM usage` snapshot up front.
 *   2. Forward every upstream byte unchanged.
 *   3. Capture the runtime's `CUSTOM agno_run_completed` (real metrics).
 *   4. After the stream ends, emit an updated `CUSTOM usage` and fire
 *      the onRunCompleted callback with the real metrics (or an
 *      estimate if the runtime didn't provide them).
 */
export function passthroughAguiStream(
  upstreamBody: ReadableStream<Uint8Array>,
  usage: UsageSnapshot,
  onRunCompleted?: OnStreamRunCompleted
): ReadableStream<Uint8Array> {
  const reader = upstreamBody.getReader()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulatedChars = 0
      let runId: string | undefined
      let finished = false
      let buffer = ''
      let realMetrics: AgnoRunMetrics | undefined

      controller.enqueue(customEvent('usage', usagePayload(usage)))

      const observeFrame = (frame: string) => {
        const ev = tryParseEvent(frame)
        if (!ev || typeof ev.type !== 'string') return
        if (ev.type === 'TEXT_MESSAGE_CONTENT' && typeof ev.delta === 'string') {
          accumulatedChars += ev.delta.length
        } else if (ev.type === 'RUN_STARTED' && typeof ev.runId === 'string') {
          runId = ev.runId
        } else if (ev.type === 'RUN_FINISHED') {
          finished = true
        } else if (ev.type === 'CUSTOM' && ev.name === 'agno_run_completed' && isAgnoRunMetrics(ev.value)) {
          const v = ev.value as { metrics?: unknown; run_id?: unknown }
          if (isAgnoRunMetrics(v.metrics)) realMetrics = v.metrics
          if (typeof v.run_id === 'string') runId = v.run_id
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
          buffer += decoder.decode(value, { stream: true })
          let frameEnd = buffer.indexOf('\n\n')
          while (frameEnd !== -1) {
            observeFrame(buffer.slice(0, frameEnd))
            buffer = buffer.slice(frameEnd + 2)
            frameEnd = buffer.indexOf('\n\n')
          }
        }

        if (buffer.trim()) {
          observeFrame(buffer)
        }

        const runTokens = realMetrics ? tokensFromMetrics(realMetrics) : Math.ceil(accumulatedChars / 4)

        if (finished) {
          controller.enqueue(customEvent('usage', usagePayload(usage, runTokens)))
        }

        controller.close()

        if (onRunCompleted) {
          const metricsPayload: Record<string, unknown> = realMetrics
            ? { ...realMetrics, source: 'agno_run_completed' }
            : {
                estimated_output_chars: accumulatedChars,
                estimated_tokens: runTokens,
                source: 'estimate'
              }
          try {
            onRunCompleted({ metrics: metricsPayload, runId })
          } catch {
            /* fire-and-forget */
          }
        }
      } catch (err) {
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
