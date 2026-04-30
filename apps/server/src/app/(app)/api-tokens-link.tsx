'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * Client-side auth check so the parent server component can stay statically
 * rendered. `payload.auth()` requires `headers()` which would opt the whole
 * page out of the cache.
 */
export function ApiTokensLink() {
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/users/me', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled) return
        const user = data && typeof data === 'object' ? (data as { user?: unknown }).user : null
        setAuthed(Boolean(user))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!authed) return null

  return (
    <Link
      href="/api-tokens"
      className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-card"
    >
      API Tokens
    </Link>
  )
}
