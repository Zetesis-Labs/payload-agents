import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { ApiTokensClient } from './api-tokens-client'

export const dynamic = 'force-dynamic'

export default async function ApiTokensPage() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/admin/login')

  const { docs } = await payload.find({
    collection: 'taxonomy',
    limit: 200,
    depth: 0,
    sort: 'name',
  })

  const taxonomies = docs
    .filter(
      (d): d is { id: number; name: string; slug: string } & typeof d =>
        typeof (d as { id?: unknown }).id === 'number' &&
        typeof (d as { name?: unknown }).name === 'string' &&
        typeof (d as { slug?: unknown }).slug === 'string'
    )
    .map(d => ({ id: d.id, name: d.name, slug: d.slug }))

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">API Tokens</h1>
      <p className="text-muted-foreground mb-8 text-sm opacity-70">
        Tokens to connect external MCP clients (Claude Desktop, Cursor, …) to the search service.
      </p>
      <ApiTokensClient taxonomies={taxonomies} />
    </main>
  )
}
