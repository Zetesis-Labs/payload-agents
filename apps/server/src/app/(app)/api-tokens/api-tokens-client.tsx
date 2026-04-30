'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
        <div className="rounded border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {newToken && (
        <div className="rounded border border-primary/40 bg-primary/10 px-4 py-3">
          <p className="mb-2 text-sm font-medium">
            Token created — copy it now, you won&apos;t see it again.
          </p>
          <code className="block rounded bg-muted px-3 py-2 font-mono text-sm break-all text-foreground">
            {newToken.token}
          </code>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens yet.</p>
      ) : (
        <ul className="space-y-3">
          {tokens.map(t => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded border border-border bg-card px-4 py-3"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.label}</span>
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">
                    {t.tokenPrefix}****
                  </code>
                  {t.taxonomies.map(tx => (
                    <span
                      key={tx.id}
                      className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                    >
                      {tx.name}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt && ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void revoke(t.id)}
                className="rounded border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div className="space-y-3 rounded border border-border bg-card p-4">
          <input
            type="text"
            placeholder="Token name (e.g. Claude Desktop)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={creating}
          />
          {taxonomies.length > 0 && (
            <div>
              <label className="mb-2 block text-xs text-muted-foreground">
                Taxonomies (optional). Selected slugs are forwarded to MCP and auto-scope every search.
              </label>
              <TaxonomyCombobox
                options={taxonomies}
                selectedIds={selected}
                onChange={setSelected}
                disabled={creating}
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void create()}
              disabled={creating || !newLabel.trim()}
              className="rounded bg-primary px-3 py-1 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
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
              className="rounded border border-border px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Create token
        </button>
      )}
    </div>
  )
}

interface TaxonomyComboboxProps {
  options: TaxonomyInfo[]
  selectedIds: number[]
  onChange: (next: number[]) => void
  disabled?: boolean
}

function TaxonomyCombobox({ options, selectedIds, onChange, disabled }: TaxonomyComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    inputRef.current?.focus()
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const selected = options.filter(o => selectedIds.includes(o.id))
  const q = query.trim().toLowerCase()
  const matchScore = (o: TaxonomyInfo): number => {
    if (!q) return 0
    const name = o.name.toLowerCase()
    const slug = o.slug.toLowerCase()
    if (name === q || slug === q) return 0
    if (name.startsWith(q) || slug.startsWith(q)) return 1
    return 2
  }
  const matched = q
    ? options
        .filter(o => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
        .sort((a, b) => matchScore(a) - matchScore(b))
    : options
  const MAX_VISIBLE = 10
  const visible = matched.slice(0, MAX_VISIBLE)
  const hiddenCount = Math.max(0, matched.length - visible.length)

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded border border-border bg-background px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
      >
        {selected.length === 0 ? (
          <span className="px-1 text-xs text-muted-foreground">Select taxonomies…</span>
        ) : (
          selected.map(tx => (
            <span
              key={tx.id}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {tx.name}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${tx.name}`}
                onClick={e => {
                  e.stopPropagation()
                  toggle(tx.id)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    toggle(tx.id)
                  }
                }}
                className="cursor-pointer opacity-60 hover:opacity-100"
              >
                ×
              </span>
            </span>
          ))
        )}
        <span className="ml-auto text-muted-foreground" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded border border-border bg-popover text-popover-foreground shadow-lg">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
            ) : (
              visible.map(tx => {
                const checked = selectedIds.includes(tx.id)
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => toggle(tx.id)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                      checked ? 'bg-accent/40' : ''
                    }`}
                  >
                    <span>
                      {tx.name}
                      <span className="ml-2 text-xs text-muted-foreground">{tx.slug}</span>
                    </span>
                    {checked && <span aria-hidden>✓</span>}
                  </button>
                )
              })
            )}
            {hiddenCount > 0 && (
              <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                +{hiddenCount} more — refine your search to see them.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
