'use client'

import { AnimatePresence } from 'framer-motion'
import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { cn } from '../lib/cn'
import { ComboboxFilter } from './ComboboxFilter'
import { FilterField } from './FilterField'
import { dayEndExclusiveIso, dayStartIso, formatTokens, formatUsd } from './format'
import { KpiCard } from './KpiCard'
import { OverviewTab } from './OverviewTab'
import { SessionCard } from './SessionCard'
import { SessionSidePanel } from './SessionSidePanel'
import { type SessionsResponse, SessionsResponseSchema } from './types'

export interface LlmUsageDashboardProps {
  /** Tenant list for the picker. Omit or pass `[]` for single-tenant setups. */
  availableTenants?: Array<{ id: number | string; name: string }>
  /** Show tenant picker. Default: `false`. */
  canPickTenant?: boolean
  /** API base path matching the plugin's basePath. Default: `'/llm-usage'` */
  basePath?: string
  /** Next.js Link (or any `<a>`-like component). Falls back to a plain `<a>`. */
  LinkComponent?: ComponentType<{ href: string; children: React.ReactNode; className?: string }>
  /** Offset from the top for the side panel (e.g. navbar height). Default: `'4rem'`. */
  panelTopOffset?: string
  /** Accent color for charts (hex). Default: `'#d4891a'`. */
  accentColor?: string
}

/* ── Main Dashboard ──────────────────────────────────────────────────── */

export function LlmUsageDashboard({
  availableTenants = [],
  canPickTenant = false,
  basePath = '/metrics',
  LinkComponent,
  panelTopOffset = '4rem',
  accentColor = '#d4891a'
}: LlmUsageDashboardProps) {
  const multiTenant = availableTenants.length > 0
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [tenantId, setTenantId] = useState('')
  const [agentSlug, setAgentSlug] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [userIdFilter, setUserIdFilter] = useState('')
  const [viewingSession, setViewingSession] = useState<string | null>(null)
  const [tab, setTab] = useState<'sessions' | 'overview'>('sessions')

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">LLM Usage</h1>
      <p className="text-sm text-muted-foreground mb-6">Agent usage and cost observability.</p>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-4 mb-6">
        <FilterField label="From">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </FilterField>
        {multiTenant && canPickTenant && (
          <FilterField label="Tenant">
            <select value={tenantId} onChange={e => setTenantId(e.target.value)}>
              <option value="">All</option>
              {availableTenants.map(t => (
                <option key={String(t.id)} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
          </FilterField>
        )}
        <div className="flex flex-1 gap-4 min-w-0">
          <ComboboxFilter
            label="Agent"
            value={agentSlug}
            onChange={setAgentSlug}
            basePath={basePath}
            field="agent"
            tenantId={tenantId}
            placeholder="Search agent…"
            className="flex-1 min-w-0"
          />
          <ComboboxFilter
            label="Model"
            value={modelFilter}
            onChange={setModelFilter}
            basePath={basePath}
            field="model"
            tenantId={tenantId}
            placeholder="Search model…"
            className="flex-1 min-w-0"
          />
          <ComboboxFilter
            label="User"
            value={userIdFilter}
            onChange={setUserIdFilter}
            basePath={basePath}
            field="user"
            tenantId={tenantId}
            placeholder="Search user…"
            className="flex-1 min-w-0"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-6">
        {(['sessions', 'overview'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'sessions' ? 'Sessions' : 'Overview'}
          </button>
        ))}
      </div>

      {tab === 'sessions' && (
        <SessionsList
          basePath={basePath}
          from={from}
          to={to}
          tenantId={tenantId}
          agentSlug={agentSlug}
          model={modelFilter}
          userId={userIdFilter}
          onViewSession={setViewingSession}
        />
      )}
      {tab === 'overview' && (
        <OverviewTab
          basePath={basePath}
          from={from}
          to={to}
          tenantId={tenantId}
          agentSlug={agentSlug}
          model={modelFilter}
          userId={userIdFilter}
          accentColor={accentColor}
          multiTenant={multiTenant}
        />
      )}

      <AnimatePresence>
        {viewingSession && (
          <SessionSidePanel
            key={viewingSession}
            basePath={basePath}
            conversationId={viewingSession}
            onClose={() => setViewingSession(null)}
            LinkComponent={LinkComponent}
            panelTopOffset={panelTopOffset}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Sessions List ───────────────────────────────────────────────────── */

function SessionsList(props: {
  basePath: string
  from: string
  to: string
  tenantId: string
  agentSlug: string
  model: string
  userId: string
  onViewSession: (id: string) => void
}) {
  const [data, setData] = useState<SessionsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filterKey = useMemo(
    () => `${props.from}|${props.to}|${props.tenantId}|${props.agentSlug}|${props.model}|${props.userId}`,
    [props.from, props.to, props.tenantId, props.agentSlug, props.model, props.userId]
  )
  useEffect(() => {
    setPage(1)
  }, [filterKey])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (props.from) params.set('from', dayStartIso(props.from))
    if (props.to) params.set('to', dayEndExclusiveIso(props.to))
    if (props.tenantId) params.set('tenantId', props.tenantId)
    if (props.agentSlug) params.set('agentSlug', props.agentSlug)
    if (props.model) params.set('model', props.model)
    if (props.userId) params.set('userId', props.userId)
    params.set('page', String(page))
    return params.toString()
  }, [props.from, props.to, props.tenantId, props.agentSlug, props.model, props.userId, page])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api${props.basePath}/sessions?${queryString}`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(errBody?.error || `HTTP ${res.status}`)
        }
        return SessionsResponseSchema.parse(await res.json())
      })
      .then(json => {
        if (!cancelled) setData(json)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [queryString, props.basePath])

  const totals = data?.totals
  const sessions = data?.sessions ?? []

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Sessions" value={totals ? String(totals.sessions) : '—'} />
        <KpiCard label="Runs" value={totals ? String(totals.runs) : '—'} />
        <KpiCard label="Cost" value={totals ? formatUsd(totals.costUsd) : '—'} />
        <KpiCard label="Tokens" value={totals ? formatTokens(totals.totalTokens) : '—'} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sessions.length === 0 && !loading && (
          <div className="py-16 text-center text-muted-foreground">No sessions found.</div>
        )}
        {sessions.map(s => (
          <SessionCard
            key={s.conversationId}
            session={s}
            expanded={expandedId === s.conversationId}
            onToggle={() => setExpandedId(prev => (prev === s.conversationId ? null : s.conversationId))}
            onViewChat={() => props.onViewSession(s.conversationId)}
          />
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} / {data.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= data.totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
      {loading && <p className="mt-4 text-center text-sm text-muted-foreground">Loading…</p>}
    </div>
  )
}
