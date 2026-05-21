/**
 * Reranker primitives for two-stage retrieval.
 *
 * The MCP search tool returns up to `inputK` candidates from Typesense
 * (lexical / vector / hybrid). A reranker is a closure that takes the
 * query and those candidates and returns them reordered by a stronger,
 * usually cross-encoder-based, relevance signal.
 *
 * The closure shape lets consumers swap providers without touching the
 * search flow: DeepInfra, Jina, self-hosted TEI, a no-op passthrough, or
 * a custom implementation backed by their own model service.
 */

/**
 * A single candidate passed to the reranker. The reranker only needs the
 * id and the text it should score; callers pass through whatever extra
 * fields they want preserved on the way back via `original`.
 */
export interface RerankerCandidate<TOriginal = unknown> {
  /** Stable id from the underlying search engine (Typesense hit id). */
  id: string
  /** The text the reranker scores against the query. Typically `chunk_text`. */
  text: string
  /** Score from the previous stage (Typesense). Optional; some rerankers ignore it. */
  previousScore?: number
  /** Opaque payload returned untouched, so the caller can recover the full hit. */
  original?: TOriginal
}

export interface RankedCandidate<TOriginal = unknown> extends RerankerCandidate<TOriginal> {
  /** Score assigned by the reranker. Higher = more relevant. */
  rerankerScore: number
}

/**
 * The reranker closure contract. Implementations may be synchronous in
 * principle but the interface is async so HTTP-backed providers fit.
 */
export type Reranker = <TOriginal = unknown>(
  query: string,
  candidates: RerankerCandidate<TOriginal>[]
) => Promise<RankedCandidate<TOriginal>[]>
