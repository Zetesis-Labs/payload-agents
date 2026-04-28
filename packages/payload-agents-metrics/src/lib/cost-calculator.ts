/**
 * LLM cost calculation with an extensible pricing table.
 */

export type LlmProvider = 'anthropic' | 'openai' | 'google'

const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  'gpt-4o': { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  'o4-mini': { input: 1.1 / 1_000_000, output: 4.4 / 1_000_000 },
  'o3-mini': { input: 1.1 / 1_000_000, output: 4.4 / 1_000_000 },
  // Anthropic
  'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-opus-4-7': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-haiku-4-5': { input: 1 / 1_000_000, output: 5 / 1_000_000 },
  // Google
  'gemini-2.0-flash': { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
  'gemini-1.5-flash': { input: 0.075 / 1_000_000, output: 0.3 / 1_000_000 }
}

/** Normalise model names: strip `provider/` prefix and look up both forms. */
function findPricing(
  model: string,
  extra: Record<string, { input: number; output: number }>
): { input: number; output: number } | null {
  if (extra[model]) return extra[model]
  if (DEFAULT_PRICING[model]) return DEFAULT_PRICING[model]

  // Try without provider prefix
  const slash = model.indexOf('/')
  if (slash > 0) {
    const bare = model.slice(slash + 1)
    if (extra[bare]) return extra[bare]
    if (DEFAULT_PRICING[bare]) return DEFAULT_PRICING[bare]
  }

  return null
}

export function calculateLlmCost(
  _provider: LlmProvider,
  model: string,
  tokens: { input: number; output: number },
  extraPricing: Record<string, { input: number; output: number }> = {}
): number {
  const pricing = findPricing(model, extraPricing)
  if (!pricing) {
    console.warn(`[metrics] No pricing data for model: ${model}`)
    return 0
  }
  return tokens.input * pricing.input + tokens.output * pricing.output
}

/** Normalise Agno provider string to our enum. */
export function normalizeProvider(raw: string): LlmProvider | null {
  const lower = raw.toLowerCase()
  if (lower.startsWith('anthropic')) return 'anthropic'
  if (lower.startsWith('openai')) return 'openai'
  if (lower.startsWith('google') || lower.startsWith('gemini')) return 'google'
  return null
}
