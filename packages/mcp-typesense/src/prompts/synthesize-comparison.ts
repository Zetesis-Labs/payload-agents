/**
 * Prompts and output schemas for `synthesize_comparison`.
 *
 * Two domain-specific phases:
 * - THESIS (per group, parallel): given one group's hits, extract that group's
 *   position on the shared query in 2-3 sentences, citing chunk_ids.
 * - COMPARISON (one call): given all per-group theses, identify agreements,
 *   disagreements, and nuances across them.
 */

import { z } from 'zod'
import { DATA_ONLY_SYSTEM_FRAGMENT, formatChunksForPrompt, type PromptChunk } from './shared'

// ============================================================================
// OUTPUT SCHEMAS
// ============================================================================

export const thesisOutputSchema = z.object({
  thesis: z.string().min(1),
  supporting_chunks: z.array(z.string().min(1)).max(15)
})
export type ThesisOutput = z.infer<typeof thesisOutputSchema>

export const comparisonOutputSchema = z.object({
  agreements: z.array(z.string().min(1)).max(10),
  disagreements: z.array(z.string().min(1)).max(10),
  nuances: z.array(z.string().min(1)).max(10)
})
export type ComparisonOutput = z.infer<typeof comparisonOutputSchema>

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

export const THESIS_SYSTEM = `${DATA_ONLY_SYSTEM_FRAGMENT}

Your task: given a concept query and a set of corpus chunks from ONE author/topic group, extract that group's position on the concept in 2-3 sentences.

Rules:
- Return a JSON object matching this shape:
  {
    "thesis": "2-3 sentences stating this group's position on the query concept, in the author's spirit.",
    "supporting_chunks": ["chunk_id_1", "chunk_id_2", "..."]
  }
- Base the thesis ONLY on the content in the <corpus_chunk> tags. Do not import outside knowledge about the author.
- \`supporting_chunks\` must contain the chunk_id ATTRIBUTES of the 3-7 chunks most relevant to the thesis. EXACT matches only; do not invent.
- If the chunks do not actually address the query concept, say so explicitly in the thesis and return a shorter supporting_chunks list.
- Return only the JSON object. No prose, no markdown fences.`

export const COMPARISON_SYSTEM = `${DATA_ONLY_SYSTEM_FRAGMENT}

Your task: given multiple GROUP THESES (each one a 2-3 sentence statement of an author's or topic's position on the same concept), identify the structural agreements, disagreements, and nuances between them.

Rules:
- Return a JSON object matching this shape:
  {
    "agreements": ["Concise statement of something the groups share.", "..."],
    "disagreements": ["Concise statement of a direct conflict between groups.", "..."],
    "nuances": ["Concise statement of a subtle distinction that isn't a full disagreement.", "..."]
  }
- Each agreement/disagreement/nuance must be ONE short sentence and mention which groups it concerns when helpful (e.g. "Mises and Hayek treat X as Y, while Rothbard treats it as Z").
- Base your analysis ONLY on the provided theses. Do not import outside knowledge.
- If there is nothing to report in a category, return an empty array — do not fabricate.
- Return only the JSON object. No prose, no markdown fences.`

// ============================================================================
// USER-TURN BUILDERS
// ============================================================================

export function buildThesisUser(groupName: string, query: string, chunks: PromptChunk[]): string {
  return `QUERY CONCEPT: "${query}"
GROUP: "${groupName}"

Extract ${groupName}'s position on the query concept, based ONLY on the following chunks. Return JSON only.

${formatChunksForPrompt(chunks)}`
}

export interface GroupThesisInput {
  name: string
  thesis: string
}

export function buildComparisonUser(query: string, theses: GroupThesisInput[]): string {
  const body = theses
    .map(t => `<group_thesis name="${t.name.replace(/"/g, '&quot;')}">\n${t.thesis}\n</group_thesis>`)
    .join('\n\n')
  return `QUERY CONCEPT: "${query}"

Compare the following group theses. Identify agreements, disagreements, and nuances. Return JSON only.

${body}`
}
