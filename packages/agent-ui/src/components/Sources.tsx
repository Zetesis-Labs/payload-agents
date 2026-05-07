'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, ChevronDown, ChevronRight, ExternalLink, FileText, Hash } from 'lucide-react'
import { useState, type ComponentType, type FC } from 'react'
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

interface DocumentGroup {
  key: string
  title: string
  slug: string
  type: string
  chunks: Source[]
}

function groupByDocument(sources: Source[]): DocumentGroup[] {
  const map = new Map<string, DocumentGroup>()
  for (const s of sources) {
    // Group strictly by (type, slug). When slug is missing every
    // chunk would otherwise become its own group — instead we fall
    // back to the title so chunks of the same document keep merging
    // even when the indexer didn't store a slug.
    const groupingKey = s.slug || s.title || s.id
    const key = `${s.type}:${groupingKey}`
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        title: s.title || s.slug || s.id,
        slug: s.slug,
        type: s.type,
        chunks: []
      }
      map.set(key, group)
    }
    group.chunks.push(s)
  }
  return Array.from(map.values())
}

function iconForType(type: string): ComponentType<{ className?: string }> {
  const t = (type || '').toLowerCase()
  if (t.includes('book')) return BookOpen
  return FileText
}

export const Sources: FC<SourcesProps> = ({ sources, generateHref, LinkComponent }) => {
  if (sources.length === 0) return null
  const groups = groupByDocument(sources)
  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Fuentes</p>
      <div className="flex flex-col gap-1.5">
        {groups.map(g => (
          <DocumentRow key={g.key} group={g} generateHref={generateHref} LinkComponent={LinkComponent} />
        ))}
      </div>
    </div>
  )
}

interface DocumentRowProps {
  group: DocumentGroup
  generateHref?: GenerateHref
  LinkComponent?: LinkComponent
}

const DocumentRow: FC<DocumentRowProps> = ({ group, generateHref, LinkComponent }) => {
  const [expanded, setExpanded] = useState(false)
  const Link = LinkComponent ?? DefaultLink
  const Icon = iconForType(group.type)
  const ChevronIcon = expanded ? ChevronDown : ChevronRight
  const href = generateHref
    ? generateHref({ type: group.type, value: { id: 0, slug: group.slug || group.chunks[0]?.id } })
    : `#${group.chunks[0]?.id ?? ''}`

  const sortedChunks = [...group.chunks].sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0))

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 text-xs">
      <div className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors rounded-lg">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex flex-1 items-center gap-2 text-left min-w-0"
        >
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate font-medium text-foreground">{group.title}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {group.chunks.length} {group.chunks.length === 1 ? 'chunk' : 'chunks'}
          </span>
          <ChevronIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
        <Link
          href={href}
          className="text-muted-foreground hover:text-primary shrink-0"
          aria-label="Abrir documento"
        >
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 divide-y divide-border/30">
              {sortedChunks.map((chunk, i) => (
                <ChunkRow key={`${chunk.id}-${i}`} chunk={chunk} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const ChunkRow: FC<{ chunk: Source }> = ({ chunk }) => {
  const parsed = parseChunkContent(chunk.content)
  const text = parsed.text || chunk.excerpt || ''
  const hasText = text.trim() !== ''
  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {typeof chunk.chunkIndex === 'number' && (
          <span className="inline-flex items-center gap-0.5 font-mono">
            <Hash className="h-2.5 w-2.5" />
            {chunk.chunkIndex}
          </span>
        )}
        {parsed.section && (
          <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5">{parsed.section}</span>
        )}
        {parsed.path && <span className="rounded-full bg-muted px-2 py-0.5">{parsed.path}</span>}
        {typeof chunk.relevanceScore === 'number' && (
          <RelevanceBar score={1 - Math.min(Math.max(chunk.relevanceScore, 0), 1)} />
        )}
      </div>
      {hasText && (
        <div className="max-h-48 overflow-y-auto">
          <MarkdownText text={text} />
        </div>
      )}
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
    <div className="ml-auto flex items-center gap-1.5">
      <div className="h-1 w-10 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
      <span className="tabular-nums">{Math.round(percentage)}%</span>
    </div>
  )
}
