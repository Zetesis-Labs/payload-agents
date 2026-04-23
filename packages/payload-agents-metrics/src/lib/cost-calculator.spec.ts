import { describe, expect, it, vi } from 'vitest'
import { calculateLlmCost, normalizeProvider } from './cost-calculator'

describe('normalizeProvider', () => {
  it('maps anthropic to anthropic', () => {
    expect(normalizeProvider('anthropic')).toBe('anthropic')
  })

  it('maps openai to openai', () => {
    expect(normalizeProvider('openai')).toBe('openai')
  })

  it('maps google to google', () => {
    expect(normalizeProvider('google')).toBe('google')
  })

  it('maps gemini to google (Agno aliases the Google provider as gemini)', () => {
    expect(normalizeProvider('gemini')).toBe('google')
  })

  it('is case-insensitive', () => {
    expect(normalizeProvider('OpenAI')).toBe('openai')
    expect(normalizeProvider('ANTHROPIC')).toBe('anthropic')
  })

  it('accepts provider-prefixed forms like "anthropic/claude-sonnet-4-6"', () => {
    expect(normalizeProvider('anthropic/claude-sonnet-4-6')).toBe('anthropic')
    expect(normalizeProvider('openai/gpt-4o')).toBe('openai')
  })

  it('returns null for unknown providers', () => {
    expect(normalizeProvider('mistral')).toBeNull()
    expect(normalizeProvider('')).toBeNull()
  })
})

describe('calculateLlmCost', () => {
  it('computes cost for a known model using default pricing', () => {
    // gpt-4o-mini: input $0.15/M, output $0.60/M
    // 1M input + 1M output = 0.15 + 0.60 = 0.75
    const cost = calculateLlmCost('openai', 'gpt-4o-mini', { input: 1_000_000, output: 1_000_000 })
    expect(cost).toBeCloseTo(0.75, 6)
  })

  it('returns zero for zero tokens even with a known model', () => {
    expect(calculateLlmCost('openai', 'gpt-4o', { input: 0, output: 0 })).toBe(0)
  })

  it('strips a provider/ prefix to find default pricing', () => {
    // "openai/gpt-4o" should resolve to the same pricing as "gpt-4o"
    const prefixed = calculateLlmCost('openai', 'openai/gpt-4o', { input: 1_000_000, output: 0 })
    const bare = calculateLlmCost('openai', 'gpt-4o', { input: 1_000_000, output: 0 })
    expect(prefixed).toBe(bare)
    expect(prefixed).toBeGreaterThan(0)
  })

  it('extraPricing overrides DEFAULT_PRICING for the same key', () => {
    const extra = { 'gpt-4o-mini': { input: 1, output: 2 } }
    const cost = calculateLlmCost('openai', 'gpt-4o-mini', { input: 1, output: 1 }, extra)
    expect(cost).toBe(3) // 1*1 + 1*2, not the default rates
  })

  it('extraPricing can introduce unknown models', () => {
    const extra = { 'custom-model': { input: 10, output: 20 } }
    const cost = calculateLlmCost('openai', 'custom-model', { input: 1, output: 2 }, extra)
    expect(cost).toBe(50) // 1*10 + 2*20
  })

  it('returns zero and warns when pricing is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cost = calculateLlmCost('openai', 'unknown-model-xyz', { input: 100, output: 100 })
    expect(cost).toBe(0)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('unknown-model-xyz')
  })

  it('charges input and output independently (no cross-contamination)', () => {
    // gpt-4o: input $2.5/M, output $10/M
    const onlyInput = calculateLlmCost('openai', 'gpt-4o', { input: 1_000_000, output: 0 })
    const onlyOutput = calculateLlmCost('openai', 'gpt-4o', { input: 0, output: 1_000_000 })
    expect(onlyInput).toBeCloseTo(2.5, 6)
    expect(onlyOutput).toBeCloseTo(10, 6)
  })
})
