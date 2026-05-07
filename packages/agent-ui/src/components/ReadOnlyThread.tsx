'use client'

import type { FC, ReactNode } from 'react'
import type { LinkComponent, Source } from '../lib/types'
import { cn } from '../lib/utils'
import type { GenerateHref } from '../runtime/AgentChatProvider'
import { MarkdownText } from './MarkdownText'
import { MessageBubble } from './MessageBubble'
import { Sources } from './Sources'
import { collectSources, ToolCallCard } from './ToolCallPart'

export type ReadOnlyThreadMessagePart =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      args?: unknown
      result?: unknown
      isError?: boolean
      sources?: Source[]
    }

export interface ReadOnlyThreadMessage {
  id: string
  role: 'user' | 'assistant'
  content: ReadOnlyThreadMessagePart[]
  sources?: Source[]
}

export interface ReadOnlyThreadProps {
  messages: ReadOnlyThreadMessage[]
  generateHref?: GenerateHref
  LinkComponent?: LinkComponent
  className?: string
}

export const ReadOnlyThread: FC<ReadOnlyThreadProps> = ({ messages, generateHref, LinkComponent, className }) => (
  <div className={cn('flex h-full flex-col gap-4 overflow-y-auto bg-background p-4', className)}>
    {messages.map(message => (
      <ReadOnlyMessage key={message.id} message={message} generateHref={generateHref} LinkComponent={LinkComponent} />
    ))}
  </div>
)

/* ── Single message ──────────────────────────────────────────────────── */

interface ReadOnlyMessageProps {
  message: ReadOnlyThreadMessage
  generateHref?: GenerateHref
  LinkComponent?: LinkComponent
}

const ReadOnlyMessage: FC<ReadOnlyMessageProps> = ({ message, generateHref, LinkComponent }) => {
  const textParts = message.content.filter(part => part.type === 'text')
  const toolParts = message.content.filter(part => part.type === 'tool-call')
  const sources = collectSources(message.sources, toolParts)

  return (
    <div className={cn('flex w-full', message.role === 'user' ? 'justify-end' : 'justify-start')}>
      <MessageBubble variant={message.role}>
        {message.role === 'assistant' ? renderAssistantText(textParts) : renderUserText(textParts)}

        {toolParts.map(part => (
          <ToolCallCard
            key={part.toolCallId}
            toolName={part.toolName}
            args={part.args}
            result={part.result}
            isError={part.isError}
            status={
              part.result === undefined && !part.isError ? { type: 'running' as const } : { type: 'complete' as const }
            }
          />
        ))}

        {sources.length > 0 && <Sources sources={sources} generateHref={generateHref} LinkComponent={LinkComponent} />}
      </MessageBubble>
    </div>
  )
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function renderAssistantText(textParts: Extract<ReadOnlyThreadMessagePart, { type: 'text' }>[]): ReactNode {
  return textParts.map(part => <MarkdownText key={textPartKey(part)} text={part.text} />)
}

function renderUserText(textParts: Extract<ReadOnlyThreadMessagePart, { type: 'text' }>[]): ReactNode {
  return textParts.map(part => (
    <span key={textPartKey(part)} className="whitespace-pre-wrap">
      {part.text}
    </span>
  ))
}

function textPartKey(part: Extract<ReadOnlyThreadMessagePart, { type: 'text' }>): string {
  return `text-${part.text.length}-${part.text.slice(0, 48)}`
}
