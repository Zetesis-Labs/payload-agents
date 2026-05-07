'use client'

import { cn } from '../lib/cn'
import { formatDuration, formatTokens, formatUsd, timeAgo } from './format'
import type { SessionRow } from './types'

export function SessionCard({
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
