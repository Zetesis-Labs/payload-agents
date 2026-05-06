/**
 * AG-UI passthrough stream with usage instrumentation.
 *
 * The portal BFF is a thin proxy in front of the agent-runtime: every
 * AG-UI event the runtime emits is forwarded to the browser unchanged.
 * On top of that we inject two CUSTOM events of our own:
 *
 *   - `usage` (prepended): a snapshot of the user's daily token budget
 *     as it stood when the request was authorised. Lets the UI render
 *     the budget bar before any token arrives.
 *   - `usage` (appended): the same snapshot updated with the run's
 *     estimated cost so the bar reflects the spend immediately.
 *
 * Token cost is estimated from the accumulated text content: AG-UI does
 * not standardise model metrics, so until the runtime emits a CUSTOM
 * metrics event we do not have access to the real input/output token
 * counts here. Estimation is good enough for the UI bar; the canonical
 * ledger lives elsewhere and is updated by the runtime callback.
 */

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
  delta?: string
  runId?: string
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

/**
 * Wrap the runtime's AG-UI byte stream:
 *   1. Emit `CUSTOM usage` snapshot up front.
 *   2. Forward every upstream byte unchanged.
 *   3. Tally accumulated text deltas to estimate token cost.
 *   4. On `RUN_FINISHED`, emit an updated `CUSTOM usage` and fire the
 *      onRunCompleted callback with an estimation payload.
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

        const estimatedTokens = Math.ceil(accumulatedChars / 4)

        if (finished) {
          controller.enqueue(customEvent('usage', usagePayload(usage, estimatedTokens)))
        }

        controller.close()

        if (onRunCompleted) {
          try {
            onRunCompleted({
              metrics: { estimated_output_chars: accumulatedChars, estimated_tokens: estimatedTokens },
              runId
            })
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
