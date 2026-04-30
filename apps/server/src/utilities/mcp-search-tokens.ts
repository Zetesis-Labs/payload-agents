import { createHash, randomBytes } from 'node:crypto'

const TOKEN_PREFIX = 'mcp_search_'
const RANDOM_BYTES = 24

export function generateToken(): { rawToken: string; tokenHash: string; tokenPrefix: string } {
  const random = randomBytes(RANDOM_BYTES).toString('base64url')
  const rawToken = `${TOKEN_PREFIX}${random}`
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    tokenPrefix: rawToken.slice(0, TOKEN_PREFIX.length + 4),
  }
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}
