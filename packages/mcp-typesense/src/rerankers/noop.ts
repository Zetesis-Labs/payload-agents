/**
 * No-op reranker. Returns candidates in their original order, copying
 * the previous-stage score into `rerankerScore` so downstream code can
 * treat all rerankers uniformly.
 *
 * Useful as a default / kill-switch when reranker config is missing or
 * disabled, and in tests where determinism matters.
 */

import type { Reranker } from './types'

export const noopReranker: Reranker = async (_query, candidates) =>
  candidates.map(c => ({ ...c, rerankerScore: c.previousScore ?? 0 }))
