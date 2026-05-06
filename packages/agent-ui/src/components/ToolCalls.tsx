'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react'
import { useState, type FC } from 'react'
import type { ToolCall } from '../lib/types'

interface ToolCallsProps {
  toolCalls: ToolCall[]
}

export const ToolCalls: FC<ToolCallsProps> = ({ toolCalls }) => {
  const [open, setOpen] = useState(false)
  if (toolCalls.length === 0) return null
  const anyLoading = toolCalls.some(tc => tc.isLoading)

  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3 w-3" />
        <span>
          {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
        </span>
        {anyLoading && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-2">
              {toolCalls.map(tc => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const ToolCallCard: FC<{ toolCall: ToolCall }> = ({ toolCall }) => {
  const [showInput, setShowInput] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const hasArgs = toolCall.args && Object.keys(toolCall.args).length > 0

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 text-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        {toolCall.isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <Check className="h-3 w-3 text-green-500" />
        )}
        <span className="font-mono font-semibold text-foreground">{toolCall.name}</span>
      </div>

      <div className="border-t border-border/40 px-3 py-1.5 flex gap-3">
        {hasArgs && (
          <button
            type="button"
            onClick={() => setShowInput(v => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {showInput ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            Input
          </button>
        )}
        {toolCall.result && (
          <button
            type="button"
            onClick={() => setShowOutput(v => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {showOutput ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            Output
          </button>
        )}
      </div>

      <AnimatePresence>
        {showInput && hasArgs && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <pre className="border-t border-border/40 bg-muted/50 px-3 py-2 overflow-x-auto max-h-48 text-[11px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-words">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOutput && toolCall.result && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <pre className="border-t border-border/40 bg-muted/50 px-3 py-2 overflow-x-auto max-h-64 text-[11px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-words">
              {toolCall.result}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
