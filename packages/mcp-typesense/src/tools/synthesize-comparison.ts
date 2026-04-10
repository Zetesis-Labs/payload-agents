/**
 * Tool: synthesize_comparison
 *
 * LLM-powered synthesis on top of `compare_perspectives`. For a given concept
 * query and 2-5 author/topic groups, the tool:
 *
 *   1. Runs `comparePerspectives` to retrieve per-group hits.
 *   2. For each group with hits, asks the client's model to extract that
 *      group's thesis on the concept (parallel sampling).
 *   3. Feeds all theses into one final sampling call that returns
 *      agreements / disagreements / nuances across the groups.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ToolContext } from '../context'
import {
  buildComparisonUser,
  buildThesisUser,
  COMPARISON_SYSTEM,
  type ComparisonOutput,
  comparisonOutputSchema,
  type GroupThesisInput,
  THESIS_SYSTEM,
  type ThesisOutput,
  thesisOutputSchema
} from '../prompts/synthesize-comparison'
import {
  hasSamplingCapability,
  requestStructuredSampling,
  SamplingError,
  type SamplingNotSupportedError,
  samplingNotSupportedError
} from '../sampling'
import type { McpAuthContext } from '../types'
import { type ComparePerspectivesInput, comparePerspectives } from './compare-perspectives'

// ============================================================================
// SCHEMA
// ============================================================================

const DEFAULT_PER_GROUP = 5
const MAX_PER_GROUP = 10
const MIN_GROUPS = 2
const MAX_GROUPS = 5
const THESIS_MAX_TOKENS = 800
const COMPARISON_MAX_TOKENS = 1500

export const synthesizeComparisonSchema = z.object({
  query: z.string().describe('Concept query (1-2 words). Same rules as search_collections.'),
  groups: z
    .array(
      z.object({
        name: z.string().describe('Display name.'),
        taxonomy_slugs: z.union([z.string(), z.array(z.string())]).describe('Taxonomy slug(s) scoping this group.')
      })
    )
    .min(MIN_GROUPS)
    .max(MAX_GROUPS)
    .describe(`${MIN_GROUPS}-${MAX_GROUPS} groups. Each generates one extra sampling call, so fewer groups = cheaper.`),
  per_group: z
    .number()
    .int()
    .min(1)
    .max(MAX_PER_GROUP)
    .optional()
    .describe(`Hits per group. Default: ${DEFAULT_PER_GROUP}. Max: ${MAX_PER_GROUP}.`),
  mode: z.enum(['lexical', 'semantic', 'hybrid']).optional().describe('Retrieval mode. Default: hybrid.'),
  collections: z.array(z.string()).optional().describe('Restrict to specific chunk collections.'),
  snippet_length: z.number().int().min(0).optional().describe('Chunk snippet length passed to retrieval. Default: 300.')
})

export type SynthesizeComparisonInput = z.infer<typeof synthesizeComparisonSchema>

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface SynthesizedGroup {
  name: string
  taxonomy_slugs: string | string[]
  total_found: number
  thesis: string | null
  supporting_chunks: Array<{ chunk_id: string; verified: boolean }>
  note?: string
}

export interface SynthesizeComparisonSuccess {
  query: string
  mode: string
  groups: SynthesizedGroup[]
  comparison: ComparisonOutput
  model: string
  sampling_calls: number
  sampling_time_ms: number
}

export interface SynthesizeComparisonErrorResult {
  error: string
  message?: string
  [key: string]: unknown
}

export type SynthesizeComparisonResult =
  | SynthesizeComparisonSuccess
  | SynthesizeComparisonErrorResult
  | SamplingNotSupportedError

// ============================================================================
// TOOL
// ============================================================================

export async function synthesizeComparison(
  input: SynthesizeComparisonInput,
  ctx: ToolContext,
  auth: McpAuthContext | null,
  server: McpServer,
  signal?: AbortSignal
): Promise<SynthesizeComparisonResult> {
  if (!hasSamplingCapability(server)) {
    return samplingNotSupportedError({
      tool: 'compare_perspectives',
      suggested_call: {
        query: input.query,
        groups: input.groups,
        per_group: input.per_group ?? DEFAULT_PER_GROUP,
        mode: input.mode,
        collections: input.collections
      },
      reason: 'Fetch per-group hits and synthesize comparison yourself.'
    })
  }

  const compareInput: ComparePerspectivesInput = {
    query: input.query,
    groups: input.groups,
    per_group: input.per_group ?? DEFAULT_PER_GROUP,
    mode: input.mode,
    collections: input.collections,
    snippet_length: input.snippet_length
  }
  const compareResult = await comparePerspectives(compareInput, ctx, auth)

  const start = Date.now()
  try {
    const theses = await runThesisPhase(server, input.query, compareResult.groups, signal)
    const synthesized = await runComparisonPhase(server, input.query, theses, signal)

    return {
      query: input.query,
      mode: compareResult.mode,
      groups: theses.map(t => buildGroupResult(t)),
      comparison: synthesized.data,
      model: synthesized.model,
      sampling_calls: theses.filter(t => t.attempted).length + 1,
      sampling_time_ms: Date.now() - start
    }
  } catch (err) {
    return shapeSamplingError(err)
  }
}

// ============================================================================
// HELPERS
// ============================================================================

interface ThesisEntry {
  name: string
  taxonomy_slugs: string | string[]
  total_found: number
  passedChunkIds: Set<string>
  thesis: string | null
  supportingChunks: string[]
  attempted: boolean
  note?: string
  model?: string
}

async function runThesisPhase(
  server: McpServer,
  query: string,
  groups: Awaited<ReturnType<typeof comparePerspectives>>['groups'],
  signal: AbortSignal | undefined
): Promise<ThesisEntry[]> {
  return Promise.all(
    groups.map(async group => {
      const base: ThesisEntry = {
        name: group.name,
        taxonomy_slugs: group.taxonomy_slugs,
        total_found: group.total_found,
        passedChunkIds: new Set<string>(),
        thesis: null,
        supportingChunks: [],
        attempted: false
      }
      if (group.hits.length === 0) {
        return { ...base, note: 'no_hits' }
      }

      const promptChunks = group.hits.map(h => ({
        chunk_id: h.chunk_id,
        chunk_index: h.chunk_index,
        chunk_text: h.chunk_text,
        headers: h.headers
      }))
      base.passedChunkIds = new Set(promptChunks.map(c => c.chunk_id))
      base.attempted = true

      const res = await requestStructuredSampling<ThesisOutput>(
        server,
        {
          system: THESIS_SYSTEM,
          user: buildThesisUser(group.name, query, promptChunks),
          maxTokens: THESIS_MAX_TOKENS,
          temperature: 0.2
        },
        thesisOutputSchema,
        signal
      )
      return {
        ...base,
        thesis: res.data.thesis,
        supportingChunks: res.data.supporting_chunks,
        model: res.model
      }
    })
  )
}

async function runComparisonPhase(
  server: McpServer,
  query: string,
  theses: ThesisEntry[],
  signal: AbortSignal | undefined
): Promise<{ data: ComparisonOutput; model: string }> {
  const inputTheses: GroupThesisInput[] = theses
    .filter((t): t is ThesisEntry & { thesis: string } => t.thesis !== null)
    .map(t => ({ name: t.name, thesis: t.thesis }))

  if (inputTheses.length < 2) {
    // Not enough theses to compare — return an empty comparison rather than fail.
    return {
      data: {
        agreements: [],
        disagreements: [],
        nuances: [`Only ${inputTheses.length} group(s) produced a thesis; no cross-group comparison possible.`]
      },
      model: theses.find(t => t.model)?.model ?? 'unknown'
    }
  }

  const res = await requestStructuredSampling<ComparisonOutput>(
    server,
    {
      system: COMPARISON_SYSTEM,
      user: buildComparisonUser(query, inputTheses),
      maxTokens: COMPARISON_MAX_TOKENS,
      temperature: 0.4
    },
    comparisonOutputSchema,
    signal
  )
  return { data: res.data, model: res.model }
}

function buildGroupResult(entry: ThesisEntry): SynthesizedGroup {
  const supporting = entry.supportingChunks.map(chunk_id => ({
    chunk_id,
    verified: entry.passedChunkIds.has(chunk_id)
  }))
  return {
    name: entry.name,
    taxonomy_slugs: entry.taxonomy_slugs,
    total_found: entry.total_found,
    thesis: entry.thesis,
    supporting_chunks: supporting,
    ...(entry.note ? { note: entry.note } : {})
  }
}

function shapeSamplingError(err: unknown): SynthesizeComparisonErrorResult {
  if (err instanceof SamplingError) {
    return {
      error: `sampling_${err.code.toLowerCase()}`,
      message: err.message
    }
  }
  return { error: 'unexpected_error', message: (err as Error)?.message ?? String(err) }
}
