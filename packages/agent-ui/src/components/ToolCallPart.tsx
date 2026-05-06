'use client'

import type { ToolCallMessagePartComponent } from '@assistant-ui/react'
import { decode as decodeToon } from '@toon-format/toon'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react'
import { type FC, useState } from 'react'
import type { Source } from '../lib/types'

/**
 * Build a `MessagePrimitive.Parts` `tools.Fallback` component.
 *
 * The card shows the tool name and disclosure toggles for Input/Output.
 * Sources are NOT rendered inside the card — `AssistantMessage` collects
 * sources from every tool-call part of the message, dedups them, and
 * renders a single citations block at the bottom (matches the legacy
 * pre-AG-UI UX).
 */
export function buildToolCallPart(): ToolCallMessagePartComponent {
  const ToolCallPart: ToolCallMessagePartComponent = ({ toolName, args, result, status, isError }) => {
    const [showInput, setShowInput] = useState(false)
    const [showOutput, setShowOutput] = useState(false)

    const isRunning = status?.type === 'running' || status?.type === 'requires-action'
    const argsText = formatArgs(args)
    const resultText = formatResult(result)

    return (
      <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 text-xs">
        <div className="flex items-center gap-2 px-3 py-2">
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : isError ? (
            <Wrench className="h-3 w-3 text-destructive" />
          ) : (
            <Check className="h-3 w-3 text-green-500" />
          )}
          <Wrench className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono font-semibold text-foreground">{toolName}</span>
        </div>

        <div className="flex gap-3 border-t border-border/40 px-3 py-1.5">
          {argsText && (
            <DisclosureButton open={showInput} onClick={() => setShowInput(v => !v)} label="Input" />
          )}
          {resultText && (
            <DisclosureButton open={showOutput} onClick={() => setShowOutput(v => !v)} label="Output" />
          )}
        </div>

        <AnimatePresence>
          {showInput && argsText && <CollapsiblePre>{argsText}</CollapsiblePre>}
          {showOutput && resultText && <CollapsiblePre>{resultText}</CollapsiblePre>}
        </AnimatePresence>
      </div>
    )
  }

  return ToolCallPart
}

const DisclosureButton: FC<{ open: boolean; onClick: () => void; label: string }> = ({ open, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
  >
    {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
    {label}
  </button>
)

const CollapsiblePre: FC<{ children: string }> = ({ children }) => (
  <motion.div
    initial={{ height: 0 }}
    animate={{ height: 'auto' }}
    exit={{ height: 0 }}
    className="overflow-hidden"
  >
    <pre className="border-t border-border/40 bg-muted/50 px-3 py-2 overflow-x-auto max-h-64 text-[11px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-words">
      {children}
    </pre>
  </motion.div>
)

function formatArgs(args: unknown): string {
  if (!args) return ''
  if (typeof args === 'string') return args
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return ''
  }
}

function formatResult(result: unknown): string {
  if (result == null) return ''
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return ''
  }
}

/**
 * Tool results from the Typesense RAG handler are encoded with TOON
 * (Token-Oriented Object Notation) — compact for LLM prompts but not
 * JSON. Try TOON first, fall back to JSON for tools that emit plain
 * JSON. Empty result (or unrecognised format) → no sources.
 */
export function extractSources(result: unknown): Source[] {
  if (!result) return []
  let parsed: unknown = result

  if (typeof result === 'string') {
    try {
      parsed = decodeToon(result)
    } catch {
      try {
        parsed = JSON.parse(result)
      } catch {
        return []
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') return []

  // TOON shape: top-level array of chunk hits OR { hits: [...] }.
  // JSON shape: { sources: [...] }.
  const candidates =
    Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { hits?: unknown }).hits)
        ? ((parsed as { hits: unknown[] }).hits)
        : Array.isArray((parsed as { sources?: unknown }).sources)
          ? ((parsed as { sources: unknown[] }).sources)
          : []

  return candidates
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map(s => ({
      id: String(s.chunk_id ?? s.id ?? ''),
      title: String(s.document_title ?? s.title ?? ''),
      slug: String(s.document_slug ?? s.slug ?? ''),
      type: typeof s.collection === 'string' ? s.collection.replace(/_chunk$/, '') : String(s.type ?? 'document'),
      chunkIndex:
        typeof s.chunk_index === 'number'
          ? s.chunk_index
          : typeof s.chunkIndex === 'number'
            ? s.chunkIndex
            : undefined,
      content:
        typeof s.chunk_text === 'string'
          ? s.chunk_text
          : typeof s.content === 'string'
            ? s.content
            : undefined,
      excerpt: typeof s.excerpt === 'string' ? s.excerpt : undefined,
      relevanceScore:
        typeof s.relevance_score === 'number'
          ? s.relevance_score
          : typeof s.relevanceScore === 'number'
            ? s.relevanceScore
            : undefined
    }))
    .filter(s => s.id !== '')
}
