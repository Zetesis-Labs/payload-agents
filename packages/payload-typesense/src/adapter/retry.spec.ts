import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isTransientError, withRetry } from './retry'

vi.mock('../core/logging/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }
}))

describe('retry', () => {
  describe('isTransientError', () => {
    it('returns false for null/undefined', () => {
      expect(isTransientError(null)).toBe(false)
      expect(isTransientError(undefined)).toBe(false)
    })

    it('returns true for ECONNREFUSED', () => {
      expect(isTransientError({ code: 'ECONNREFUSED' })).toBe(true)
    })

    it('returns true for ETIMEDOUT', () => {
      expect(isTransientError({ code: 'ETIMEDOUT' })).toBe(true)
    })

    it('returns true for nested cause.code', () => {
      expect(isTransientError({ cause: { code: 'ECONNRESET' } })).toBe(true)
    })

    it('returns true for httpStatus 429', () => {
      expect(isTransientError({ httpStatus: 429 })).toBe(true)
    })

    it('returns true for httpStatus 503', () => {
      expect(isTransientError({ httpStatus: 503 })).toBe(true)
    })

    it('returns false for httpStatus 404', () => {
      expect(isTransientError({ httpStatus: 404 })).toBe(false)
    })

    it('returns true for Error with "timeout" in message', () => {
      expect(isTransientError(new Error('Request timeout exceeded'))).toBe(true)
    })

    it('returns false for non-transient error (e.g. 400)', () => {
      expect(isTransientError({ httpStatus: 400 })).toBe(false)
    })
  })

  describe('withRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('ok')

      const result = await withRetry(fn, 'test-op')

      expect(result).toBe('ok')
      expect(fn).toHaveBeenCalledOnce()
    })

    it('retries on transient error and succeeds', async () => {
      const fn = vi.fn().mockRejectedValueOnce({ code: 'ECONNREFUSED' }).mockResolvedValueOnce('recovered')

      const promise = withRetry(fn, 'test-op', { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 })

      // Advance past the retry delay
      await vi.advanceTimersByTimeAsync(100)

      const result = await promise

      expect(result).toBe('recovered')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('throws immediately on non-transient error', async () => {
      const nonTransient = { httpStatus: 400, message: 'Bad Request' }
      const fn = vi.fn().mockRejectedValue(nonTransient)

      await expect(withRetry(fn, 'test-op')).rejects.toBe(nonTransient)
      expect(fn).toHaveBeenCalledOnce()
    })

    it('exhausts retries and throws last error', async () => {
      const transientError = { code: 'ECONNREFUSED' }
      const fn = vi.fn().mockRejectedValue(transientError)

      const promise = withRetry(fn, 'test-op', { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 })

      // Attach catch handler before advancing timers to prevent unhandled rejection
      const caught = promise.catch((e: unknown) => e)

      await vi.advanceTimersByTimeAsync(500)

      const result = await caught
      expect(result).toBe(transientError)
      expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
    })

    it('respects maxRetries config', async () => {
      const transientError = { code: 'ETIMEDOUT' }
      const fn = vi.fn().mockRejectedValue(transientError)

      const promise = withRetry(fn, 'test-op', { maxRetries: 1, baseDelayMs: 10, maxDelayMs: 50 })

      const caught = promise.catch((e: unknown) => e)

      await vi.advanceTimersByTimeAsync(500)

      const result = await caught
      expect(result).toBe(transientError)
      expect(fn).toHaveBeenCalledTimes(2) // 1 initial + 1 retry
    })
  })
})
