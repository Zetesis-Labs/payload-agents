/**
 * LLM cost estimation from Agno run metrics.
 *
 * Pricing tables are approximate and should be updated periodically.
 * Last updated: April 2026.
 */

export interface RunMetrics {
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  reasoning_tokens?: number
}

interface ModelPricing {
  /** Cost per 1M input tokens (USD). */
  input: number
  /** Cost per 1M output tokens (USD). */
  output: number
  /** Cost per 1M cached input tokens. Falls back to input if absent. */
  cachedInput?: number
}

const PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'openai/o4-mini': { input: 1.1, output: 4.4, cachedInput: 0.275 },
  'openai/o3-mini': { input: 1.1, output: 4.4, cachedInput: 0.275 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6, cachedInput: 0.075 },
  'openai/gpt-4o': { input: 2.5, output: 10.0, cachedInput: 1.25 },
  'openai/gpt-4.1-mini': { input: 0.4, output: 1.6, cachedInput: 0.1 },
  'openai/gpt-4.1': { input: 2.0, output: 8.0, cachedInput: 0.5 },
  // Anthropic
  'anthropic/claude-haiku-4-5': { input: 1.0, output: 5.0, cachedInput: 0.1 },
  'anthropic/claude-sonnet-4-6': { input: 3.0, output: 15.0, cachedInput: 0.3 },
  'anthropic/claude-opus-4-6': { input: 5.0, output: 25.0, cachedInput: 0.5 },
  // DeepSeek
  'deepseek/deepseek-v3.2': { input: 0.28, output: 0.42, cachedInput: 0.028 },
  // Google
  'google/gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'google/gemini-3-flash': { input: 0.5, output: 3.0 },
  'google/gemini-2.5-pro': { input: 1.25, output: 10.0 },
  // Qwen
  'qwen/qwen-turbo': { input: 0.065, output: 0.26 },
  'qwen/qwen3.5-plus': { input: 0.26, output: 1.56 },
  'qwen/qwen3.6-plus': { input: 0.325, output: 1.95 },
  'qwen/qwen3-max': { input: 0.78, output: 3.9 }
}

/** Fallback pricing when model is not in the table. Uses gpt-4o-mini rates. */
const DEFAULT_PRICING: ModelPricing = { input: 0.15, output: 0.6, cachedInput: 0.075 }

function getPricing(llmModel: string): ModelPricing {
  return PRICING[llmModel] ?? DEFAULT_PRICING
}

/**
 * Estimate the real USD cost of a single run.
 *
 * @param llmModel - Model identifier as stored in Payload (e.g. "openai/o4-mini").
 * @param metrics  - Token metrics from an Agno run.
 */
export function estimateRunCost(llmModel: string, metrics: RunMetrics): number {
  const pricing = getPricing(llmModel)
  const cached = metrics.cache_read_tokens ?? 0
  const nonCachedInput = Math.max(0, metrics.input_tokens - cached)
  const cachedRate = pricing.cachedInput ?? pricing.input

  return (
    (nonCachedInput / 1_000_000) * pricing.input +
    (cached / 1_000_000) * cachedRate +
    (metrics.output_tokens / 1_000_000) * pricing.output
  )
}

/**
 * Compute cost-weighted effective tokens.
 *
 * Normalises all token categories to "input-equivalent" tokens using
 * the model's pricing ratios. This gives a single number that reflects
 * real cost, usable for budget enforcement.
 *
 * Example (o4-mini): output is 4x the price of input, so 1 output token
 * counts as 4 effective tokens. Cached input is 0.25x, so 1 cached token
 * counts as 0.25 effective tokens.
 */
export function effectiveTokens(llmModel: string, metrics: RunMetrics): number {
  const pricing = getPricing(llmModel)
  const cached = metrics.cache_read_tokens ?? 0
  const nonCachedInput = Math.max(0, metrics.input_tokens - cached)

  const inputRatio = 1
  const cachedRatio = (pricing.cachedInput ?? pricing.input) / pricing.input
  const outputRatio = pricing.output / pricing.input

  return Math.ceil(nonCachedInput * inputRatio + cached * cachedRatio + metrics.output_tokens * outputRatio)
}

/**
 * Return a detailed cost breakdown for display/logging.
 */
export function costBreakdown(
  llmModel: string,
  metrics: RunMetrics
): {
  model: string
  inputTokens: number
  cachedTokens: number
  nonCachedTokens: number
  outputTokens: number
  reasoningTokens: number
  inputCost: number
  cachedCost: number
  outputCost: number
  totalCost: number
  effectiveTokens: number
} {
  const pricing = getPricing(llmModel)
  const cached = metrics.cache_read_tokens ?? 0
  const nonCached = Math.max(0, metrics.input_tokens - cached)
  const cachedRate = pricing.cachedInput ?? pricing.input

  const inputCost = (nonCached / 1_000_000) * pricing.input
  const cachedCost = (cached / 1_000_000) * cachedRate
  const outputCost = (metrics.output_tokens / 1_000_000) * pricing.output

  return {
    model: llmModel,
    inputTokens: metrics.input_tokens,
    cachedTokens: cached,
    nonCachedTokens: nonCached,
    outputTokens: metrics.output_tokens,
    reasoningTokens: metrics.reasoning_tokens ?? 0,
    inputCost,
    cachedCost,
    outputCost,
    totalCost: inputCost + cachedCost + outputCost,
    effectiveTokens: effectiveTokens(llmModel, metrics)
  }
}
