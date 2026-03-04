/**
 * Retry utility with exponential backoff for transient Typesense errors.
 *
 * Only retries on errors that are likely transient:
 * - Network errors: ECONNREFUSED, ECONNRESET, ETIMEDOUT, UND_ERR_CONNECT_TIMEOUT
 * - HTTP 503 Service Unavailable
 * - HTTP 429 Too Many Requests
 */

import { logger } from '../core/logging/logger'

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Base delay in ms for exponential backoff (default: 500) */
  baseDelayMs?: number
  /** Maximum delay in ms (default: 5000) */
  maxDelayMs?: number
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000
}

/** Network error codes that indicate a transient failure */
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'EPIPE',
  'EAI_AGAIN'
])

/** HTTP status codes that indicate a transient failure */
const TRANSIENT_HTTP_CODES = new Set([429, 503])

/**
 * Determine if an error is transient and worth retrying.
 */
export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const err = error as { code?: string; httpStatus?: number; cause?: { code?: string } }

  // Network-level errors
  if (err.code && TRANSIENT_ERROR_CODES.has(err.code)) return true

  // Nested cause (e.g. fetch errors wrap the real cause)
  if (err.cause?.code && TRANSIENT_ERROR_CODES.has(err.cause.code)) return true

  // Typesense SDK HTTP errors
  if (err.httpStatus && TRANSIENT_HTTP_CODES.has(err.httpStatus)) return true

  // Timeout-related message patterns
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('econnreset')) {
      return true
    }
  }

  return false
}

/**
 * Calculate delay with exponential backoff + jitter.
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = baseDelayMs * 2 ** attempt
  const jitter = Math.random() * baseDelayMs * 0.5
  return Math.min(exponentialDelay + jitter, maxDelayMs)
}

/**
 * Execute a function with retry on transient errors.
 *
 * @param fn - The async function to execute
 * @param operationName - Description for logging (e.g. "upsertDocument")
 * @param config - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries are exhausted, or immediately for non-transient errors
 */
export async function withRetry<T>(fn: () => Promise<T>, operationName: string, config?: RetryConfig): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_CONFIG, ...config }

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Don't retry non-transient errors
      if (!isTransientError(error)) throw error

      // Don't retry if we've exhausted all attempts
      if (attempt >= maxRetries) break

      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs)
      logger.warn(
        `Transient error in ${operationName}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`,
        {
          error: error instanceof Error ? error.message : String(error),
          attempt: attempt + 1,
          maxRetries,
          delayMs: Math.round(delay)
        }
      )

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
