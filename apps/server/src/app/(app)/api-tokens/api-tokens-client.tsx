'use client'

import { useCallback, useEffect, useState } from 'react'

interface TaxonomyInfo {
  id: number
  name: string
  slug: string
}

interface Token {
  id: number
  label: string
  tokenPrefix: string
  lastUsedAt: string | null
  createdAt: string
  taxonomies: TaxonomyInfo[]
}

interface NewTokenResult {
  id: number
  label: string
  token: string
}

export function ApiTokensClient({ taxonomies }: { taxonomies: TaxonomyInfo[] }) {
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [newToken, setNewToken] = useState<NewTokenResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/search/mcp/tokens')
      if (!res.ok) throw new Error('Failed to load tokens')
      const data = (await res.json()) as { tokens: Token[] }
      setTokens(data.tokens)
    } catch {
      setError('Failed to load tokens')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTokens()
  }, [fetchTokens])

  const create = async () => {
    if (!newLabel.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/search/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim(), taxonomies: selected }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error || 'Create failed')
      }
      const data = (await res.json()) as NewTokenResult
      setNewToken(data)
      setNewLabel('')
      setSelected([])
      setShowForm(false)
      void fetchTokens()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: number) => {
    setError(null)
    try {
      const res = await fetch('/api/search/mcp/tokens', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      if (newToken?.id === id) setNewToken(null)
      void fetchTokens()
    } catch {
      setError('Failed to revoke token')
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {newToken && (
        <div className="rounded border border-green-300 bg-green-50 px-4 py-3">
          <p className="mb-2 text-sm font-medium text-green-800">
            Token created — copy it now, you won&apos;t see it again.
          </p>
          <code className="block rounded bg-white px-3 py-2 text-sm font-mono break-all">
            {newToken.token}
          </code>
        </div>
      )}

      {loading ? (
        <p className="text-sm opacity-60">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm opacity-60">No tokens yet.</p>
      ) : (
        <ul className="space-y-3">
          {tokens.map(t => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded border px-4 py-3"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.label}</span>
                  <code className="rounded bg-zinc-100 px-2 py-0.5 text-xs">
                    {t.tokenPrefix}****
                  </code>
                  {t.taxonomies.map(tx => (
                    <span
                      key={tx.id}
                      className="rounded-full border px-2 py-0.5 text-xs"
                    >
                      {tx.name}
                    </span>
                  ))}
                </div>
                <p className="text-xs opacity-60">
                  Created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt && ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void revoke(t.id)}
                className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div className="space-y-3 rounded border p-4">
          <input
            type="text"
            placeholder="Token name (e.g. Claude Desktop)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            disabled={creating}
          />
          {taxonomies.length > 0 && (
            <div>
              <p className="mb-2 text-xs opacity-70">
                Taxonomies (optional). Selected slugs are forwarded to MCP and auto-scope every search.
              </p>
              <div className="flex flex-wrap gap-2">
                {taxonomies.map(tx => {
                  const checked = selected.includes(tx.id)
                  return (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() =>
                        setSelected(prev =>
                          prev.includes(tx.id) ? prev.filter(id => id !== tx.id) : [...prev, tx.id]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs ${
                        checked ? 'border-black bg-black text-white' : 'hover:bg-zinc-50'
                      }`}
                      disabled={creating}
                    >
                      {tx.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void create()}
              disabled={creating || !newLabel.trim()}
              className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-40"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setNewLabel('')
                setSelected([])
              }}
              className="rounded border px-3 py-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          Create token
        </button>
      )}
    </div>
  )
}
