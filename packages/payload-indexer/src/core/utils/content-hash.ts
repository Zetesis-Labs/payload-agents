import { createHash } from 'node:crypto'

/**
 * Compute a SHA-256 hash of the given text content.
 * Used to detect when embeddable content has changed between syncs.
 */
export const computeContentHash = (text: string): string => {
  return createHash('sha256').update(text).digest('hex')
}
