/**
 * Output formatting for MCP tool responses.
 * Default: TOON (Token-Oriented Object Notation) for ~40% token savings over JSON.
 * Fallback: JSON for clients that don't understand TOON.
 *
 * @see https://toonformat.dev
 */

import { encode } from '@toon-format/toon'

export type OutputFormat = 'toon' | 'json'

/**
 * Format data as TOON or JSON.
 */
export function formatResponse(data: unknown, format: OutputFormat = 'toon'): string {
  if (format === 'json') return JSON.stringify(data, null, 2)
  return encode(data)
}

/**
 * Build a standard MCP tool result.
 */
export function toolResult(data: unknown, format: OutputFormat = 'toon') {
  return {
    content: [{ type: 'text' as const, text: formatResponse(data, format) }]
  }
}
