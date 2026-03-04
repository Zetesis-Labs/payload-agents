/**
 * In-memory per-user lock to serialize operations that must not run concurrently
 * (e.g. token limit check + request processing).
 *
 * Uses Promise chaining: each call for the same userId waits for the previous one
 * to complete before starting. Different userIds run in parallel.
 *
 * Limitation: single-instance only. For multi-instance deployments, the
 * `checkTokenLimit` callback should use an atomic database operation
 * (e.g. UPDATE ... RETURNING or Redis INCR).
 */

const locks = new Map<string, Promise<unknown>>()

/**
 * Serialize execution of `fn` per userId.
 * Concurrent calls for the same user are queued; different users run in parallel.
 */
export async function withUserLock<T>(userId: string | number, fn: () => Promise<T>): Promise<T> {
  const key = String(userId)
  const previous = locks.get(key) ?? Promise.resolve()

  // Chain the new operation after the previous one completes (success or failure)
  const current = previous.then(fn, fn)

  locks.set(key, current)

  try {
    return await current
  } finally {
    // Clean up the entry if this was the last operation in the chain
    if (locks.get(key) === current) {
      locks.delete(key)
    }
  }
}
