/**
 * Prompts and output schemas for `summarize_document`.
 *
 * Two-phase map-reduce:
 * - MAP: each bundle of chunks → {summary, claims[]} via `mapOutputSchema`.
 * - REDUCE: list of bundle summaries → {summary, key_claims[]} via
 *   `reduceOutputSchema`. Reduce is skipped when there is only one bundle.
 */

import { z } from 'zod'
import { DATA_ONLY_SYSTEM_FRAGMENT, formatChunksForPrompt, type PromptChunk } from './shared'

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

export const mapOutputSchema = z.object({
  summary: z.string().min(1),
  claims: z
    .array(
      z.object({
        text: z.string().min(1),
        chunk_id: z.string().min(1)
      })
    )
    .max(20)
})

export type MapOutput = z.infer<typeof mapOutputSchema>

export const reduceOutputSchema = z.object({
  summary: z.string().min(1),
  key_claims: z
    .array(
      z.object({
        text: z.string().min(1),
        chunk_id: z.string().min(1)
      })
    )
    .max(25)
})

export type ReduceOutput = z.infer<typeof reduceOutputSchema>

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

export const MAP_SYSTEM = `${DATA_ONLY_SYSTEM_FRAGMENT}

Your task: summarize the provided bundle of corpus chunks and extract the most important discrete claims.

Rules:
- Return a JSON object matching this shape:
  {
    "summary": "3-6 sentence summary of the bundle, in the author's spirit.",
    "claims": [
      { "text": "Short self-contained claim, paraphrased in one sentence.", "chunk_id": "id-of-supporting-chunk" }
    ]
  }
- Base the summary ONLY on the content of the corpus chunks. Do not add outside knowledge.
- Each claim MUST have a \`chunk_id\` that EXACTLY matches the "id" attribute of a <corpus_chunk> tag you saw. Do not invent ids.
- Keep claims discrete and non-overlapping. 5-15 claims per bundle is typical.
- Do not include markdown, prose before/after the JSON, or explanatory comments. Return only the JSON object.`

export const REDUCE_SYSTEM = `${DATA_ONLY_SYSTEM_FRAGMENT}

Your task: merge a list of partial summaries (each covering one bundle of a larger document) into a single cohesive summary plus a unified list of key claims.

Rules:
- Return a JSON object matching this shape:
  {
    "summary": "5-10 sentence cohesive summary of the WHOLE document, in the author's spirit.",
    "key_claims": [
      { "text": "Short self-contained claim.", "chunk_id": "id-of-supporting-chunk" }
    ]
  }
- Preserve the \`chunk_id\` fields from the input claims — do not renumber, merge, or invent ids.
- Deduplicate overlapping claims but keep the chunk_id of the most representative occurrence.
- Aim for 10-20 key_claims for the whole document.
- Return only the JSON object. No prose, no markdown fences.`

// ============================================================================
// USER-TURN BUILDERS
// ============================================================================

export function buildMapUser(bundle: PromptChunk[], focus?: string): string {
  const focusLine = focus
    ? `FOCUS: Orient the summary and claim selection around this theme: "${focus}". Pay particular attention to passages relevant to it. If a bundle contains nothing relevant to the focus, still summarize what is there.\n\n`
    : ''
  return `${focusLine}Summarize the following corpus chunks and extract key claims. Return JSON only.\n\n${formatChunksForPrompt(bundle)}`
}

export interface BundleSummary {
  summary: string
  claims: Array<{ text: string; chunk_id: string }>
}

export function buildReduceUser(bundleSummaries: BundleSummary[], focus?: string): string {
  const focusLine = focus ? `FOCUS: Orient the final summary around this theme: "${focus}".\n\n` : ''
  const body = bundleSummaries
    .map((b, i) => {
      const claimsJson = JSON.stringify(b.claims, null, 2)
      return `<bundle_summary index="${i}">\n${b.summary}\nCLAIMS:\n${claimsJson}\n</bundle_summary>`
    })
    .join('\n\n')
  return `${focusLine}Merge the following per-bundle summaries into a single cohesive summary + unified key_claims list. Return JSON only.\n\n${body}`
}
