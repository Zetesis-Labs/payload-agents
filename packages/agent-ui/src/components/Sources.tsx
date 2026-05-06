'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import { type FC, useState } from 'react'
import { DefaultLink, type LinkComponent, type Source } from '../lib/types'
import type { GenerateHref } from '../runtime/AgentChatProvider'
import { MarkdownText } from './MarkdownText'

interface SourcesProps {
  sources: Source[]
  generateHref?: GenerateHref
  LinkComponent?: LinkComponent
}

const SEPARATOR = '.________________________________________.'

interface ParsedChunk {
  text: string
  section?: string
  path?: string
}

function dedupSources(sources: Source[]): Source[] {
  const seen = new Set<string>()
  const out: Source[] = []
  for (const s of sources) {
    const key = `${s.id}:${s.slug}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function parseChunkContent(content: string | undefined): ParsedChunk {
  if (!content) return { text: '' }
  if (!content.includes(SEPARATOR)) return { text: content }
  const [text = '', metadataRaw = ''] = content.split(SEPARATOR)
  const out: ParsedChunk = { text: text.trim() }
  for (const part of metadataRaw.split('|')) {
    const trimmed = part.trim()
    const lower = trimmed.toLowerCase()
    if (lower.startsWith('section:')) out.section = trimmed.substring('section:'.length).trim()
    else if (lower.startsWith('path:')) out.path = trimmed.substring('path:'.length).trim()
  }
  return out
}

export const Sources: FC<SourcesProps> = ({ sources, generateHref, LinkComponent }) => {
  if (sources.length === 0) return null
  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Fuentes</p>
      <div className="flex flex-col gap-2">
        {dedupSources(sources).map(s => (
          <SourceRow key={`${s.id}:${s.slug}`} source={s} generateHref={generateHref} LinkComponent={LinkComponent} />
        ))}
      </div>
    </div>
  )
}

interface SourceRowProps {
  source: Source
  generateHref?: GenerateHref
  LinkComponent?: LinkComponent
}

const SourceRow: FC<SourceRowProps> = ({ source, generateHref, LinkComponent }) => {
  const [expanded, setExpanded] = useState(false)
  const Link = LinkComponent ?? DefaultLink
  const href = generateHref
    ? generateHref({ type: source.type, value: { id: 0, slug: source.slug || source.id } })
    : `#${source.id}`

  const hasPreview = Boolean(source.content || source.excerpt)
  const Icon = expanded ? ChevronDown : ChevronRight
  const parsed = parseChunkContent(source.content)
  const text = parsed.text || source.excerpt || ''

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 text-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        {hasPreview ? (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? 'Cerrar previsualización' : 'Abrir previsualización'}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="inline-block w-3.5" />
        )}
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate font-medium text-foreground">{source.title || source.slug || source.id}</span>
        {typeof source.relevanceScore === 'number' && (
          <RelevanceBar score={1 - Math.min(Math.max(source.relevanceScore, 0), 1)} />
        )}
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
          aria-label="Abrir documento"
        >
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <AnimatePresence>
        {expanded && hasPreview && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border/40"
          >
            <div className="px-3 py-2 space-y-2">
              {(parsed.section || parsed.path) && (
                <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                  {parsed.section && (
                    <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5">
                      {parsed.section}
                    </span>
                  )}
                  {parsed.path && <span className="rounded-full bg-muted px-2 py-0.5">{parsed.path}</span>}
                </div>
              )}
              <div className="max-h-48 overflow-y-auto">
                <MarkdownText text={text} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const RelevanceBar: FC<{ score: number }> = ({ score }) => {
  const percentage = Math.min(Math.max(score * 100, 0), 100)
  const color =
    percentage >= 80
      ? 'bg-green-500'
      : percentage >= 60
        ? 'bg-primary'
        : percentage >= 40
          ? 'bg-yellow-500'
          : 'bg-muted-foreground'
  return (
    <div className="hidden sm:flex items-center gap-1.5 shrink-0">
      <div className="h-1 w-10 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(percentage)}%</span>
    </div>
  )
}
