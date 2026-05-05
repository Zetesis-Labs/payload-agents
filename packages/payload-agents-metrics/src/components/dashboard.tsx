'use client'

import { type Message, Thread, useAssistantRuntime } from '@zetesis/chat-agent'
import { AnimatePresence, motion } from 'framer-motion'
import type { ComponentType } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { z } from 'zod'
import type { ApiKeySource } from '../lib/build-where'
import { cn } from '../lib/cn'

/* ── Schemas + types ─────────────────────────────────────────────────── */

const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  type: z.string()
})

const SessionRowSchema = z.object({
  conversationId: z.string(),
  agentSlug: z.string(),
  model: z.string(),
  userId: z.number(),
  userLabel: z.string(),
  tenantId: z.number(),
  tenantLabel: z.string(),
  runs: z.number(),
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  firstRunAt: z.string(),
  lastRunAt: z.string(),
  durationMs: z.number(),
  totalLatencyMs: z.number(),
  errors: z.number(),
  firstMessage: z.string().nullable()
})
type SessionRow = z.infer<typeof SessionRowSchema>

const SessionsResponseSchema = z.object({
  sessions: z.array(SessionRowSchema),
  totals: z.object({
    sessions: z.number(),
    runs: z.number(),
    costUsd: z.number(),
    totalTokens: z.number()
  }),
  page: z.number(),
  totalPages: z.number()
})
type SessionsResponse = z.infer<typeof SessionsResponseSchema>

const SessionMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        input: z.record(z.unknown()),
        result: z.string().optional(),
        sources: z.array(SourceSchema).optional()
      })
    )
    .optional(),
  sources: z.array(SourceSchema).optional()
})
type SessionMessage = z.infer<typeof SessionMessageSchema>

const SessionDetailResponseSchema = z.object({
  messages: z.array(SessionMessageSchema)
})

const GroupBySchema = z.enum(['tenant', 'agent', 'user', 'model', 'apiKeySource', 'apiKeyFingerprint', 'day'])
type GroupBy = z.infer<typeof GroupBySchema>

const BucketRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  keys: z.record(z.string()),
  labels: z.record(z.string()),
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  events: z.number()
})
type BucketRow = z.infer<typeof BucketRowSchema>

const SeriesRowSchema = z.object({
  day: z.string(),
  totalTokens: z.number(),
  costUsd: z.number(),
  events: z.number()
})
type SeriesRow = z.infer<typeof SeriesRowSchema>

const AggregateResponseSchema = z.object({
  groupBy: z.array(GroupBySchema),
  totals: z.object({
    totalTokens: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
    events: z.number()
  }),
  buckets: z.array(BucketRowSchema),
  topBuckets: z.array(BucketRowSchema),
  bucketsPage: z.number(),
  bucketsTotalPages: z.number(),
  bucketsTotal: z.number(),
  series: z.array(SeriesRowSchema)
})
type AggregateResponse = z.infer<typeof AggregateResponseSchema>

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

/* ── Helpers ─────────────────────────────────────────────────────────── */

function formatUsd(n: number): string {
  if (n >= 100) return `$${n.toFixed(2)}`
  if (n >= 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(5)}`
}
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}
function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--card-foreground)'
}

/** Convert the start of a `YYYY-MM-DD` day to UTC ISO. */
function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00Z`).toISOString()
}

/** Convert the end of a `YYYY-MM-DD` day to UTC ISO (exclusive upper bound). */
function dayEndExclusiveIso(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

const ALL_GROUPS_MT: GroupBy[] = ['tenant', 'agent', 'user', 'model', 'apiKeySource', 'apiKeyFingerprint', 'day']
const ALL_GROUPS_ST: GroupBy[] = ALL_GROUPS_MT.filter(g => g !== 'tenant')

type ApiKeySourceFilter = ApiKeySource | ''

function isApiKeySourceFilter(v: string): v is ApiKeySourceFilter {
  return v === '' || v === 'agent' || v === 'user'
}
const GROUP_LABELS: Record<GroupBy, string> = {
  tenant: 'Tenant',
  agent: 'Agent',
  user: 'User',
  model: 'Model',
  apiKeySource: 'API key source',
  apiKeyFingerprint: 'Fingerprint',
  day: 'Day'
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

/* ── Session Card ────────────────────────────────────────────────────── */

function SessionCard({
  session: s,
  expanded,
  onToggle,
  onViewChat
}: {
  session: SessionRow
  expanded: boolean
  onToggle: () => void
  onViewChat: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={e => e.key === 'Enter' && onToggle()}
      className={cn(
        'rounded-xl border border-border bg-card p-4 cursor-pointer transition-colors hover:border-primary/40',
        expanded && 'border-primary/30'
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            {s.agentSlug}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{s.model}</span>
          {s.errors > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">
              {s.errors} error{s.errors > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{timeAgo(s.lastRunAt)}</span>
      </div>
      {s.firstMessage && <p className="text-sm text-muted-foreground italic truncate mb-2">"{s.firstMessage}"</p>}
      <div className="flex flex-wrap gap-4 text-xs">
        <span>
          <strong>{s.runs}</strong> {s.runs === 1 ? 'msg' : 'msgs'}
        </span>
        <span>
          <strong>{formatUsd(s.costUsd)}</strong>
        </span>
        <span>
          <strong>{formatTokens(s.totalTokens)}</strong> tokens
        </span>
        <span>{formatDuration(s.durationMs)}</span>
        <span className="text-muted-foreground">{s.userLabel}</span>
      </div>
      {expanded && (
        <div
          className="mt-3 pt-3 border-t border-border"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
            <div>
              <span className="text-muted-foreground">Input</span>
              <br />
              {formatTokens(s.inputTokens)}
            </div>
            <div>
              <span className="text-muted-foreground">Output</span>
              <br />
              {formatTokens(s.outputTokens)}
            </div>
            <div>
              <span className="text-muted-foreground">Latency</span>
              <br />
              {formatDuration(s.totalLatencyMs)}
            </div>
            <div>
              <span className="text-muted-foreground">Tenant</span>
              <br />
              {s.tenantLabel}
            </div>
          </div>
          <p className="mb-3 break-all font-mono text-[10px] text-muted-foreground">{s.conversationId}</p>
          <button
            type="button"
            onClick={onViewChat}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            View conversation →
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Session Side Panel ──────────────────────────────────────────────── */

function SessionSidePanel({
  basePath,
  conversationId,
  onClose,
  LinkComponent,
  panelTopOffset
}: {
  basePath: string
  conversationId: string
  onClose: () => void
  LinkComponent?: ComponentType<{ href: string; children: React.ReactNode; className?: string }>
  panelTopOffset: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api${basePath}/session?conversationId=${encodeURIComponent(conversationId)}`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return SessionDetailResponseSchema.parse(await res.json())
      })
      .then(data => {
        setMessages(
          data.messages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: new Date(),
            toolCalls: m.toolCalls?.map(tc => ({
              ...tc,
              sources: tc.sources?.map(s => ({ ...s, chunkIndex: 0, relevanceScore: 0, content: '' }))
            })),
            sources: m.sources?.map(s => ({ ...s, chunkIndex: 0, relevanceScore: 0, content: '' }))
          }))
        )
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [conversationId, basePath])

  const generateHref = useCallback(
    ({ type, value }: { type: string; value: { id: number; slug?: string | null } }) =>
      `/${type}/${value.slug || value.id}`,
    []
  )

  const Anchor = LinkComponent || 'a'

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      style={{ top: panelTopOffset }}
      className="fixed bottom-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="truncate font-mono text-xs text-muted-foreground">{conversationId}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm hover:bg-muted transition-colors"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
        ) : (
          <ReadOnlyThread
            messages={messages}
            setMessages={setMessages}
            conversationId={conversationId}
            generateHref={generateHref}
            LinkComponent={Anchor}
          />
        )}
      </div>
    </motion.div>
  )
}

function ReadOnlyThread({
  messages,
  setMessages,
  conversationId,
  generateHref,
  LinkComponent
}: {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  conversationId: string
  generateHref: (p: { type: string; value: { id: number; slug?: string | null } }) => string
  LinkComponent: ComponentType<{ href: string; children: React.ReactNode; className?: string }> | string
}) {
  const runtime = useAssistantRuntime({
    messages,
    setMessages,
    conversationId,
    setConversationId: () => {},
    selectedDocuments: [],
    selectedAgent: null
  })
  return (
    <Thread
      runtime={runtime}
      generateHref={generateHref}
      LinkComponent={LinkComponent as ComponentType<Record<string, unknown>>}
    />
  )
}

/* ── Overview Tab ───────────────────────────────────────────────────��── */

function OverviewTab(props: {
  basePath: string
  from: string
  to: string
  tenantId: string
  agentSlug: string
  model: string
  userId: string
  accentColor: string
  multiTenant: boolean
}) {
  const allGroups = props.multiTenant ? ALL_GROUPS_MT : ALL_GROUPS_ST
  const defaultGroup: GroupBy = props.multiTenant ? 'tenant' : 'agent'
  const [groupBy, setGroupBy] = useState<GroupBy[]>([defaultGroup])
  const [apiKeySource, setApiKeySource] = useState<ApiKeySourceFilter>('')
  const [bucketsPage, setBucketsPage] = useState(1)
  const [data, setData] = useState<AggregateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleGroupBy = useCallback(
    (dim: GroupBy) => {
      setGroupBy(prev => {
        const next = prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]
        return next.length > 0 ? next : [defaultGroup]
      })
    },
    [defaultGroup]
  )

  const filterKey = useMemo(
    () =>
      `${props.from}|${props.to}|${props.tenantId}|${props.agentSlug}|${props.model}|${props.userId}|${apiKeySource}|${groupBy.join(',')}`,
    [props.from, props.to, props.tenantId, props.agentSlug, props.model, props.userId, apiKeySource, groupBy]
  )
  useEffect(() => {
    setBucketsPage(1)
  }, [filterKey])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('groupBy', groupBy.join(','))
    if (props.from) params.set('from', dayStartIso(props.from))
    if (props.to) params.set('to', dayEndExclusiveIso(props.to))
    if (props.tenantId) params.set('tenantId', props.tenantId)
    if (props.agentSlug) params.set('agentSlug', props.agentSlug)
    if (props.model) params.set('model', props.model)
    if (props.userId) params.set('userId', props.userId)
    if (apiKeySource) params.set('apiKeySource', apiKeySource)
    params.set('bucketsPage', String(bucketsPage))
    return params.toString()
  }, [
    groupBy,
    props.from,
    props.to,
    props.tenantId,
    props.agentSlug,
    props.model,
    props.userId,
    apiKeySource,
    bucketsPage
  ])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api${props.basePath}/aggregate?${queryString}`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(errBody?.error || `HTTP ${res.status}`)
        }
        return AggregateResponseSchema.parse(await res.json())
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
  const buckets = data?.buckets ?? []
  const topBuckets = data?.topBuckets ?? []
  const series = data?.series ?? []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground">Group by:</span>
        {allGroups.map(g => (
          <button
            key={g}
            type="button"
            onClick={() => toggleGroupBy(g)}
            className={cn(
              'rounded-full px-3 py-1 text-xs border transition-colors',
              groupBy.includes(g)
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {GROUP_LABELS[g]}
          </button>
        ))}
        <select
          value={apiKeySource}
          onChange={e => {
            if (isApiKeySourceFilter(e.target.value)) setApiKeySource(e.target.value)
          }}
        >
          <option value="">API key: All</option>
          <option value="agent">Agent</option>
          <option value="user">BYOK</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Cost" value={totals ? formatUsd(totals.costUsd) : '—'} />
        <KpiCard label="Tokens" value={totals ? formatTokens(totals.totalTokens) : '—'} />
        <KpiCard label="Input" value={totals ? formatTokens(totals.inputTokens) : '—'} />
        <KpiCard label="Output" value={totals ? formatTokens(totals.outputTokens) : '—'} />
        <KpiCard label="Events" value={totals ? formatNumber(totals.events) : '—'} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3">Cost per day</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: unknown, name: string) =>
                  name === 'costUsd' ? formatUsd(Number(v)) : formatNumber(Number(v))
                }
              />
              <Legend />
              <Line type="monotone" dataKey="costUsd" name="Cost (USD)" stroke={props.accentColor} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3">Top by cost</h3>
        <div className="w-full" style={{ height: Math.max(220, Math.min(topBuckets.length, 12) * 32) }}>
          <ResponsiveContainer>
            <BarChart data={topBuckets} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" className="text-xs" />
              <YAxis type="category" dataKey="label" width={200} className="text-xs" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => formatUsd(Number(v))} />
              <Bar dataKey="costUsd" name="Cost (USD)" fill={props.accentColor} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {groupBy.map(g => (
                <th key={g} className="text-left px-3 py-2 font-semibold">
                  {GROUP_LABELS[g]}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-semibold">Input</th>
              <th className="text-right px-3 py-2 font-semibold">Output</th>
              <th className="text-right px-3 py-2 font-semibold">Total</th>
              <th className="text-right px-3 py-2 font-semibold">Cost</th>
              <th className="text-right px-3 py-2 font-semibold">Events</th>
            </tr>
          </thead>
          <tbody>
            {buckets.length === 0 && !loading && (
              <tr>
                <td colSpan={groupBy.length + 5} className="text-center text-muted-foreground py-8">
                  No data.
                </td>
              </tr>
            )}
            {buckets.map(b => (
              <tr key={b.key} className="border-b border-border/50 hover:bg-muted/30">
                {groupBy.map(g => (
                  <td key={g} className="px-3 py-2">
                    {b.labels?.[g] ?? b.keys?.[g] ?? b.label}
                  </td>
                ))}
                <td className="text-right px-3 py-2 tabular-nums">{formatNumber(b.inputTokens)}</td>
                <td className="text-right px-3 py-2 tabular-nums">{formatNumber(b.outputTokens)}</td>
                <td className="text-right px-3 py-2 tabular-nums">{formatNumber(b.totalTokens)}</td>
                <td className="text-right px-3 py-2 tabular-nums">{formatUsd(b.costUsd)}</td>
                <td className="text-right px-3 py-2 tabular-nums">{formatNumber(b.events)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.bucketsTotalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            type="button"
            disabled={bucketsPage <= 1}
            onClick={() => setBucketsPage(p => p - 1)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-muted-foreground">
            Page {data.bucketsPage} / {data.bucketsTotalPages} · {formatNumber(data.bucketsTotal)} groups
          </span>
          <button
            type="button"
            disabled={bucketsPage >= data.bucketsTotalPages}
            onClick={() => setBucketsPage(p => p + 1)}
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

/* ── Shared ──────────────────────────────────────────────────────────── */

function ComboboxFilter({
  label,
  value,
  onChange,
  basePath,
  field,
  tenantId,
  placeholder,
  className
}: {
  label: string
  value: string
  onChange: (value: string) => void
  basePath: string
  field: 'agent' | 'model' | 'user'
  tenantId?: string
  placeholder?: string
  className?: string
}) {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<Array<{ label: string; value: string }>>([])
  const [hasMore, setHasMore] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const skipNextDebounceRef = useRef(false)

  useEffect(() => {
    if (!value) setQuery('')
  }, [value])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const fetchOptions = useCallback(
    (q: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      const params = new URLSearchParams({ field, q })
      if (tenantId) params.set('tenantId', tenantId)
      fetch(`/api${basePath}/filter-options?${params.toString()}`, {
        credentials: 'include',
        signal: controller.signal
      })
        .then(r => r.json())
        .then((data: { options?: Array<{ label: string; value: string }>; hasMore?: boolean }) => {
          if (controller.signal.aborted) return
          setOptions(data.options ?? [])
          setHasMore(data.hasMore ?? false)
          setOpen(true)
        })
        .catch(err => {
          if (err?.name === 'AbortError') return
          setOptions([])
        })
        .finally(() => {
          if (controller.signal.aborted) return
          setLoading(false)
        })
    },
    [field, basePath, tenantId]
  )

  useEffect(() => {
    if (skipNextDebounceRef.current) {
      skipNextDebounceRef.current = false
      return
    }
    if (query.length < 1) return
    const timeout = setTimeout(() => fetchOptions(query), 250)
    return () => clearTimeout(timeout)
  }, [query, fetchOptions])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current) return
      if (!(e.target instanceof Node)) return
      if (containerRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function select(opt: { label: string; value: string }) {
    skipNextDebounceRef.current = true
    onChange(opt.value)
    setQuery(opt.label)
    setOpen(false)
  }

  function clear() {
    onChange('')
    setQuery('')
    setOptions([])
    setOpen(false)
  }

  return (
    <div className={cn('flex flex-col gap-1 text-xs', className)} ref={containerRef}>
      <span className="text-muted-foreground">{label}</span>
      <div className="relative w-full">
        <div className="flex items-center w-full">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => fetchOptions(query)}
            placeholder={placeholder}
            className="combobox-input min-w-0"
          />
          {(value || query) && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
        {open && (options.length > 0 || loading) && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md text-xs">
            {loading && <div className="px-3 py-2 text-muted-foreground">Loading…</div>}
            {!loading &&
              options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors block"
                  onClick={() => select(opt)}
                >
                  {opt.label}
                </button>
              ))}
            {!loading && hasMore && (
              <div className="border-t border-border px-3 py-2 text-muted-foreground italic">
                Refine your search to see more results
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
