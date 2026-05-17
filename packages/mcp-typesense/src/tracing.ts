/**
 * OpenTelemetry tracing helpers for the MCP Typesense package.
 *
 * The package only depends on `@opentelemetry/api` — the spec interface,
 * no SDK. When the consumer wires a real `TracerProvider` (e.g. exporting
 * to Langfuse via OTLP), spans flow through. When nothing is configured,
 * the no-op tracer returned by `trace.getTracer` makes every call free.
 *
 * Span naming + attributes follow the OpenInference-ish convention so
 * Langfuse renders search calls under the "retrieval" lens.
 */

import { type Span, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api'

const TRACER_NAME = '@zetesis/mcp-typesense'
const TRACER_VERSION = '0.5.1'

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION)
}

/**
 * Wrap `fn` in an active span. The span ends automatically when the
 * promise resolves or rejects; exceptions are recorded and rethrown.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean | string[] | undefined>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const tracer = getTracer()
  return tracer.startActiveSpan(name, async span => {
    setAttributes(span, attributes)
    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message })
      throw err
    } finally {
      span.end()
    }
  })
}

/**
 * Apply attributes filtering out `undefined` so the consumer can pass
 * conditional values without per-field guards.
 */
export function setAttributes(
  span: Span,
  attributes: Record<string, string | number | boolean | string[] | undefined>
): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    span.setAttribute(key, value)
  }
}
