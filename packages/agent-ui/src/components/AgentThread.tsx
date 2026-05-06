'use client'

import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessageRuntime,
  useThreadRuntime
} from '@assistant-ui/react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowUpIcon, Sparkles, SquareIcon } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import type { Source, ToolCall } from '../lib/types'
import { useAgentChat } from '../runtime/AgentChatProvider'
import { LimitAlert } from './LimitAlert'
import { MarkdownText } from './MarkdownText'
import { Sources } from './Sources'
import { TokenUsageBar } from './TokenUsageBar'
import { ToolCalls } from './ToolCalls'

export interface AgentThreadProps {
  welcomeTitle?: string
  welcomeSubtitle?: string
  suggestedQuestions?: Array<{
    prompt: string
    title: string
    description: string
  }>
}

export const AgentThread: FC<AgentThreadProps> = ({ welcomeTitle, welcomeSubtitle, suggestedQuestions }) => {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      <LimitAlert />
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 pt-4">
        <ThreadPrimitive.Empty>
          {welcomeTitle && welcomeSubtitle && (
            <ThreadWelcome title={welcomeTitle} subtitle={welcomeSubtitle} suggestedQuestions={suggestedQuestions} />
          )}
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage
          }}
        />
        <TypingIndicator />
      </ThreadPrimitive.Viewport>
      <div className="sticky bottom-0 border-t border-border bg-gradient-to-t from-background via-background to-background/80 backdrop-blur-sm">
        <TokenUsageBar />
        <div className="p-4 pt-2">
          <Composer />
        </div>
      </div>
    </ThreadPrimitive.Root>
  )
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } }
} as const

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
}

interface ThreadWelcomeProps {
  title: string
  subtitle: string
  suggestedQuestions?: Array<{ prompt: string; title: string; description: string }>
}

const ThreadWelcome: FC<ThreadWelcomeProps> = ({ title, subtitle, suggestedQuestions }) => (
  <motion.div
    className="flex h-full flex-col items-center justify-center p-4 max-w-2xl mx-auto"
    variants={containerVariants}
    initial="hidden"
    animate="visible"
  >
    <motion.div className="text-center mb-8 space-y-3" variants={itemVariants}>
      <motion.div
        className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"
        animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles className="w-8 h-8 text-primary" />
      </motion.div>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-lg text-muted-foreground">{subtitle}</p>
    </motion.div>
    {suggestedQuestions && suggestedQuestions.length > 0 && (
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full" variants={containerVariants}>
        {suggestedQuestions.map(q => (
          <motion.div key={q.prompt} variants={itemVariants}>
            <ThreadPrimitive.Suggestion
              prompt={q.prompt}
              className="group relative flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-start cursor-pointer overflow-hidden transition-colors duration-200 hover:border-primary/30"
            >
              <div className="relative flex items-center justify-between w-full">
                <span className="font-medium text-sm text-foreground">{q.title}</span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
              </div>
              <span className="relative text-xs text-muted-foreground">{q.description}</span>
            </ThreadPrimitive.Suggestion>
          </motion.div>
        ))}
      </motion.div>
    )}
  </motion.div>
)

const TypingIndicator: FC = () => {
  const threadRuntime = useThreadRuntime()
  const [isRunning, setIsRunning] = useState(false)
  const { agentName } = useAgentChat()

  useEffect(() => {
    const unsubscribe = threadRuntime.subscribe(() => {
      setIsRunning(threadRuntime.getState().isRunning)
    })
    setIsRunning(threadRuntime.getState().isRunning)
    return unsubscribe
  }, [threadRuntime])

  return (
    <AnimatePresence>
      {isRunning && (
        <motion.div
          className="flex justify-start py-4 w-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <div className="max-w-[85%] rounded-2xl rounded-bl-md border-l-4 border-l-primary/30 bg-card/80 backdrop-blur-sm px-5 py-4 text-card-foreground shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="typing-dot w-2 h-2 rounded-full bg-primary/60" />
                <span className="typing-dot w-2 h-2 rounded-full bg-primary/60" />
                <span className="typing-dot w-2 h-2 rounded-full bg-primary/60" />
              </div>
              <span className="text-sm text-muted-foreground">{agentName ?? 'El asistente'} está pensando...</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const Composer: FC = () => (
  <ComposerPrimitive.Root className="flex w-full items-end max-w-4xl mx-auto">
    <div className="relative flex w-full flex-col rounded-3xl border border-input bg-background/50 px-4 py-2 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50">
      <ComposerPrimitive.Input
        placeholder="Escribe tu pregunta..."
        className="w-full resize-none border-none bg-transparent px-2 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-0 max-h-[200px] min-h-[52px] pr-12"
        rows={1}
        autoFocus
      />
      <div className="absolute bottom-3 right-3 flex items-center justify-center p-1">
        <ComposerPrimitive.Send asChild>
          <button
            type="submit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-all disabled:opacity-50 disabled:shadow-none"
            aria-label="Enviar mensaje"
          >
            <ArrowUpIcon className="h-5 w-5" />
          </button>
        </ComposerPrimitive.Send>
        <ComposerPrimitive.Cancel asChild>
          <button
            type="button"
            className="hidden data-[running=true]:inline-flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-all"
            aria-label="Cancelar"
          >
            <SquareIcon className="h-3 w-3 fill-current" />
          </button>
        </ComposerPrimitive.Cancel>
      </div>
    </div>
  </ComposerPrimitive.Root>
)

const UserMessage: FC = () => (
  <MessagePrimitive.Root className="flex justify-end py-2 w-full">
    <motion.div
      className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-md shadow-primary/20"
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <MessagePrimitive.Content
        components={{
          Text: ({ text }) => <span className="whitespace-pre-wrap font-medium">{text}</span>
        }}
      />
    </motion.div>
  </MessagePrimitive.Root>
)

const AssistantMessage: FC = () => {
  const messageRuntime = useMessageRuntime()
  const { generateHref, LinkComponent } = useAgentChat()
  const state = messageRuntime.getState()
  const metadata = state.metadata as { custom?: { sources?: Source[]; toolCalls?: ToolCall[] } } | undefined
  const sources = metadata?.custom?.sources ?? []
  const toolCalls = metadata?.custom?.toolCalls ?? []

  return (
    <MessagePrimitive.Root className="flex justify-start py-4 w-full">
      <motion.div
        className="max-w-[85%] rounded-2xl rounded-bl-md border-l-4 border-l-primary/30 bg-card/80 backdrop-blur-sm px-5 py-4 text-card-foreground shadow-sm"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        <MessagePrimitive.Content
          components={{
            Text: MarkdownText
          }}
        />
        {toolCalls.length > 0 && <ToolCalls toolCalls={toolCalls} />}
        {sources.length > 0 && <Sources sources={sources} generateHref={generateHref} LinkComponent={LinkComponent} />}
      </motion.div>
    </MessagePrimitive.Root>
  )
}
