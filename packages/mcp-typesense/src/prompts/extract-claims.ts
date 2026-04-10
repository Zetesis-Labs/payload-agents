/**
 * Prompts and output schema for `extract_claims`.
 * Single-phase (no reduce): each bundle independently yields typed claims,
 * which are concatenated at the tool level. Claims are discrete by nature,
 * so a reduce step would add cost without improving coherence.
 */

import { z } from 'zod'
import { DATA_ONLY_SYSTEM_FRAGMENT, formatChunksForPrompt, type PromptChunk } from './shared'

export const CLAIM_TYPES = ['factual', 'normative', 'definitional', 'predictive'] as const
export type ClaimType = (typeof CLAIM_TYPES)[number]

export const outputSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().min(1),
        type: z.enum(CLAIM_TYPES),
        chunk_id: z.string().min(1),
        confidence: z.number().min(0).max(1)
      })
    )
    .max(80)
})

export type ExtractClaimsOutput = z.infer<typeof outputSchema>

export const SYSTEM = `${DATA_ONLY_SYSTEM_FRAGMENT}

Your task: extract discrete, atomic claims from the corpus chunks. Classify each by type and rate your confidence.

Claim types:
- "factual": asserts something about the world that could in principle be verified (e.g. "X happened in year Y").
- "normative": asserts what should or ought to be (e.g. "the state should not have a monopoly on justice").
- "definitional": defines a term or concept (e.g. "freedom is the absence of coercion").
- "predictive": asserts what will happen (e.g. "socialism always collapses").

Rules:
- Return a JSON object matching this shape:
  {
    "claims": [
      {
        "text": "Short self-contained claim in one sentence, paraphrased.",
        "type": "factual" | "normative" | "definitional" | "predictive",
        "chunk_id": "id-of-supporting-chunk",
        "confidence": 0.0 to 1.0
      }
    ]
  }
- \`chunk_id\` MUST EXACTLY match the "id" attribute of a <corpus_chunk> tag you saw. Do not invent ids.
- \`confidence\` reflects how clearly the chunk expresses the claim (1.0 = stated explicitly; 0.3 = inferred).
- Each claim should be atomic — one assertion per claim. If a chunk contains multiple, emit multiple entries.
- Return only the JSON object. No prose, no markdown fences.`

export function buildUser(bundle: PromptChunk[], types?: ClaimType[], maxClaimsPerChunk?: number): string {
  const lines: string[] = []
  if (types && types.length > 0) {
    lines.push(`TYPE FILTER: Extract ONLY claims of these types: ${types.join(', ')}. Skip claims of other types.`)
  }
  if (maxClaimsPerChunk) {
    lines.push(`BUDGET: Emit at most ${maxClaimsPerChunk} claims per <corpus_chunk>.`)
  }
  const preamble = lines.length > 0 ? `${lines.join('\n')}\n\n` : ''
  return `${preamble}Extract claims from the following corpus chunks. Return JSON only.\n\n${formatChunksForPrompt(bundle)}`
}
