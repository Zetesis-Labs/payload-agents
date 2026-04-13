/**
 * Agno SSE → legacy adapter stream translator.
 *
 * Translates Agno runtime SSE events to the schema that
 * `@zetesis/chat-agent` NexoPayloadChatAdapter expects:
 *
 *   - `RunContent`       → `{ type: "token", data: <content> }`
 *   - `RunStarted`       → `{ type: "conversation_id", data: <session_id> }`
 *   - `RunError`         → `{ type: "error", data: { error: <content> } }`
 *   - `RunCompleted`     → `{ type: "done" }`
 *   - `ToolCallStarted`  → `{ type: "tool_call", data: { … } }`
 *   - `ToolCallCompleted` → `{ type: "tool_call", data: { …, result, sources } }`
 */

import { extractSources } from './sources'

interface UsageSnapshot {
  limit: number
  used: number
  remaining: number
  reset_at: string
}

interface TranslatorState {
  accumulatedText: string
  completed: boolean
  sources: Array<{ id: string; title: string; slug: string; type: string }>
}

const _encoder = new TextEncoder()

function formatLegacyEvent(event: unknown): Uint8Array {
  return _encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

function parseSseFrame(frame: string): Record<string, unknown> | null {
  let eventName: string | null = null
  let dataLine: string | null = null
  for (const raw of frame.split('\n')) {
    if (raw.startsWith('event: ')) eventName = raw.slice(7).trim()
    else if (raw.startsWith('data: ')) dataLine = dataLine !== null ? `${dataLine}\n${raw.slice(6)}` : raw.slice(6)
  }
  if (!dataLine) return null
  try {
    const parsed = JSON.parse(dataLine) as Record<string, unknown>
    if (eventName && !parsed.event) parsed.event = eventName
    return parsed
  } catch {
    return null
  }
}

/** Handle a single parsed Agno event and emit the corresponding legacy event(s). */
function handleAgnoEvent(
  parsed: Record<string, unknown>,
  state: TranslatorState,
  usage: UsageSnapshot,
  emit: (event: unknown) => void
): void {
  switch (parsed.event as string) {
    case 'RunContent': {
      const content = typeof parsed.content === 'string' ? parsed.content : ''
      if (content) {
        state.accumulatedText += content
        emit({ type: 'token', data: content })
      }
      break
    }
    case 'ToolCallStarted':
      emitToolCallStarted(parsed, emit)
      break
    case 'ToolCallCompleted':
      emitToolCallCompleted(parsed, state, emit)
      break
    case 'RunError': {
      const err = typeof parsed.content === 'string' ? parsed.content : 'Run error'
      emit({ type: 'error', data: { error: err } })
      break
    }
    case 'RunCompleted':
      emitRunCompleted(parsed, state, usage, emit)
      break
    // RunStarted, ReasoningContentDelta, ModelRequestCompleted, etc. → noop
  }
}

function emitToolCallStarted(parsed: Record<string, unknown>, emit: (event: unknown) => void): void {
  const tool = parsed.tool as Record<string, unknown> | undefined
  if (!tool) return
  emit({
    type: 'tool_call',
    data: {
      id: tool.tool_call_id || '',
      name: tool.tool_name || '',
      input: tool.tool_args || {}
    }
  })
}

function emitToolCallCompleted(
  parsed: Record<string, unknown>,
  state: TranslatorState,
  emit: (event: unknown) => void
): void {
  const tool = parsed.tool as Record<string, unknown> | undefined
  if (!tool) return
  const toolSources = extractSources(tool.result)
  state.sources.push(...toolSources)
  emit({
    type: 'tool_call',
    data: {
      id: tool.tool_call_id || '',
      name: tool.tool_name || '',
      input: tool.tool_args || {},
      result: tool.result || '',
      sources: toolSources.length > 0 ? toolSources : undefined
    }
  })
}

function emitRunCompleted(
  parsed: Record<string, unknown>,
  state: TranslatorState,
  usage: UsageSnapshot,
  emit: (event: unknown) => void
): void {
  if (state.sources.length > 0) {
    emit({ type: 'sources', data: state.sources })
  }
  const metrics = parsed.metrics as Record<string, unknown> | undefined
  const realTokens =
    typeof metrics?.input_tokens === 'number' && typeof metrics?.output_tokens === 'number'
      ? (metrics.input_tokens as number) + (metrics.output_tokens as number)
      : Math.ceil(state.accumulatedText.length / 4)
  emit({
    type: 'usage',
    data: {
      daily_limit: usage.limit,
      daily_used: usage.used + realTokens,
      daily_remaining: Math.max(0, usage.remaining - realTokens),
      reset_at: usage.reset_at
    }
  })
  emit({ type: 'done' })
  state.completed = true
}

export function translateAgnoStream(
  upstreamBody: ReadableStream<Uint8Array>,
  sessionId: string,
  usage: UsageSnapshot
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const reader = upstreamBody.getReader()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = ''
      const state: TranslatorState = { accumulatedText: '', completed: false, sources: [] }
      const emit = (event: unknown) => controller.enqueue(formatLegacyEvent(event))

      try {
        emit({ type: 'conversation_id', data: sessionId })

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          buffer = processBuffer(buffer, state, usage, emit)
        }

        // Flush remaining
        if (buffer.trim()) {
          const parsed = parseSseFrame(buffer)
          if (parsed?.event === 'RunContent' && typeof parsed.content === 'string') {
            emit({ type: 'token', data: parsed.content })
          }
        }

        if (!state.completed) {
          emit({ type: 'done' })
        }
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error'
        console.error('[chat] translator error:', err)
        try {
          emit({ type: 'error', data: { error: msg } })
        } catch {
          /* controller may already be closed */
        }
        controller.close()
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

/** Extract and process all complete SSE frames from the buffer, returning the remaining buffer. */
function processBuffer(
  buffer: string,
  state: TranslatorState,
  usage: UsageSnapshot,
  emit: (event: unknown) => void
): string {
  let remaining = buffer
  let frameEnd = remaining.indexOf('\n\n')
  while (frameEnd !== -1) {
    const frame = remaining.slice(0, frameEnd)
    remaining = remaining.slice(frameEnd + 2)
    frameEnd = remaining.indexOf('\n\n')

    const parsed = parseSseFrame(frame)
    if (parsed) {
      handleAgnoEvent(parsed, state, usage, emit)
    }
  }
  return remaining
}
