import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type { BasePayload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { generateToken } from '@/utilities/mcp-search-tokens'

export const dynamic = 'force-dynamic'

async function requireSessionUser(payload: BasePayload) {
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  return { user }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await requireSessionUser(payload)
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  const label = body.label?.trim()
  const taxonomies = Array.isArray(body.taxonomies)
    ? body.taxonomies.filter((id: unknown): id is number => Number.isFinite(id))
    : []

  if (!label) {
    return NextResponse.json({ error: 'Label is required' }, { status: 400 })
  }

  const { rawToken, tokenHash, tokenPrefix } = generateToken()

  const doc = await payload.create({
    collection: 'mcp-search-tokens',
    data: {
      label,
      tokenHash,
      tokenPrefix,
      user: auth.user.id,
      taxonomies,
    } as Record<string, unknown>,
  })

  return NextResponse.json({ id: doc.id, label: doc.label, token: rawToken })
}

export async function GET() {
  const payload = await getPayload({ config })
  const auth = await requireSessionUser(payload)
  if (auth instanceof NextResponse) return auth

  const { docs } = await payload.find({
    collection: 'mcp-search-tokens',
    where: { user: { equals: auth.user.id } },
    depth: 1,
    limit: 50,
    pagination: false,
    sort: '-createdAt',
  })

  const tokens = docs.map(doc => {
    const taxonomies = Array.isArray((doc as unknown as { taxonomies?: unknown }).taxonomies)
      ? ((doc as unknown as { taxonomies: unknown[] }).taxonomies
          .map(t =>
            typeof t === 'object' && t !== null
              ? {
                  id: (t as { id?: unknown }).id,
                  name: (t as { name?: unknown }).name,
                  slug: (t as { slug?: unknown }).slug,
                }
              : null
          )
          .filter(
            (t): t is { id: number; name: string; slug: string } =>
              t !== null &&
              typeof t.id === 'number' &&
              typeof t.name === 'string' &&
              typeof t.slug === 'string'
          ))
      : []

    return {
      id: doc.id,
      label: doc.label,
      tokenPrefix: doc.tokenPrefix,
      lastUsedAt: doc.lastUsedAt,
      createdAt: doc.createdAt,
      taxonomies,
    }
  })

  return NextResponse.json({ tokens })
}

export async function DELETE(request: Request) {
  const payload = await getPayload({ config })
  const auth = await requireSessionUser(payload)
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  if (!body.id) {
    return NextResponse.json({ error: 'Token id is required' }, { status: 400 })
  }

  try {
    const existing = await payload.findByID({ collection: 'mcp-search-tokens', id: body.id, depth: 0 })
    const ownerId = typeof existing.user === 'object' ? (existing.user as { id: number | string }).id : existing.user
    if (String(ownerId) !== String(auth.user.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await payload.delete({ collection: 'mcp-search-tokens', id: body.id })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
