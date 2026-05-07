'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { cn } from '../lib/cn'
import { dayEndExclusiveIso, dayStartIso, formatNumber, formatTokens, formatUsd } from './format'
import { KpiCard } from './KpiCard'
import { type AggregateResponse, AggregateResponseSchema, type GroupBy } from './types'

type ApiKeySourceFilter = 'agent' | 'user' | ''

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

const ALL_GROUPS_MT: GroupBy[] = ['tenant', 'agent', 'user', 'model', 'apiKeySource', 'apiKeyFingerprint', 'day']
const ALL_GROUPS_ST: GroupBy[] = ALL_GROUPS_MT.filter(g => g !== 'tenant')

const tooltipStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--card-foreground)'
}

export function OverviewTab(props: {
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
