import { headers as nextHeaders } from 'next/headers'
import { NextResponse } from 'next/server'
import type { BasePayload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { hashToken } from '@/utilities/mcp-search-tokens'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MCP_INTERNAL_URL = process.env.MCP_INTERNAL_URL || 'http://localhost:3030/mcp'

async function findTokenByHash(payload: BasePayload, tokenHash: string) {
  const { docs } = await payload.find({
    collection: 'mcp-search-tokens',
    where: { tokenHash: { equals: tokenHash } },
    depth: 1,
    limit: 1,
    pagination: false,
  })
  return docs[0] ?? null
}

function updateTokenLastUsed(payload: BasePayload, tokenId: number | string): void {
  payload
    .update({
      collection: 'mcp-search-tokens',
      id: tokenId,
      data: { lastUsedAt: new Date().toISOString() } as Record<string, unknown>,
    })
    .catch(() => {})
}

async function authenticateRequest(
  hdrs: Headers,
  request: Request
): Promise<{ taxonomySlugs: string[] } | NextResponse> {
  const authorization = hdrs.get('authorization')
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')

  const rawToken = queryToken ?? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
  if (!rawToken) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const tokenDoc = await findTokenByHash(payload, hashToken(rawToken))
  if (!tokenDoc) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const rawTaxonomies = (tokenDoc as unknown as { taxonomies?: unknown }).taxonomies
  const taxonomySlugs: string[] = Array.isArray(rawTaxonomies)
    ? rawTaxonomies
        .map(t => (typeof t === 'object' && t !== null ? (t as { slug?: unknown }).slug : null))
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
    : []

  updateTokenLastUsed(payload, tokenDoc.id as number | string)
  return { taxonomySlugs }
}

async function proxyToMcp(request: Request): Promise<Response> {
  const hdrs = await nextHeaders()
  const auth = await authenticateRequest(hdrs, request)
  if (auth instanceof NextResponse) return auth

  const forwardHeaders: Record<string, string> = {
    'Content-Type': hdrs.get('content-type') || 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (auth.taxonomySlugs.length > 0) {
    forwardHeaders['x-taxonomy-slugs'] = auth.taxonomySlugs.join(',')
  }

  const sessionId = hdrs.get('mcp-session-id')
  if (sessionId) forwardHeaders['mcp-session-id'] = sessionId

  const body = request.method !== 'GET' ? await request.text() : null

  let upstream: globalThis.Response
  try {
    upstream = await fetch(MCP_INTERNAL_URL, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: AbortSignal.timeout(55_000),
    })
  } catch {
    return NextResponse.json({ error: 'MCP search service is unavailable' }, { status: 502 })
  }

  const responseHeaders = new Headers()
  const contentType = upstream.headers.get('content-type')
  if (contentType) responseHeaders.set('Content-Type', contentType)

  const mcpSessionId = upstream.headers.get('mcp-session-id')
  if (mcpSessionId) responseHeaders.set('mcp-session-id', mcpSessionId)

  if (contentType?.includes('text/event-stream')) {
    responseHeaders.set('Cache-Control', 'no-cache, no-transform')
    responseHeaders.set('X-Accel-Buffering', 'no')
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

export const POST = proxyToMcp
export const GET = proxyToMcp
export const DELETE = proxyToMcp
