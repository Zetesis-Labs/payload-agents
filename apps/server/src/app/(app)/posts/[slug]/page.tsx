import { getPayload } from 'payload'
import config from '@/payload.config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { RichText } from '@payloadcms/richtext-lexical/react'

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'posts',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })

  const post = docs[0]
  if (!post) notFound()

  const categories =
    Array.isArray(post.categories)
      ? (post.categories.filter((c) => typeof c === 'object' && c !== null) as unknown as Record<string, unknown>[])
      : []

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/"
        className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Volver
      </Link>

      <article>
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {post.publishedAt && (
              <time className="text-sm text-muted-foreground">
                {new Date(post.publishedAt).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            )}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <span
                    key={String(cat.id)}
                    className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {String(cat.title ?? cat.name ?? cat.id)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {post.content && (
          <div className="prose prose-invert max-w-none">
            <RichText data={post.content} />
          </div>
        )}
      </article>
    </main>
  )
}
