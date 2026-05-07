'use client'

// Components
export { AgentThread, type AgentThreadProps } from './components/AgentThread'
export { AgentThreadList, type AgentThreadListProps, type SessionSummary } from './components/AgentThreadList'
export { LimitAlert } from './components/LimitAlert'
export { MarkdownText, type MarkdownTextProps } from './components/MarkdownText'
export {
  ReadOnlyThread,
  type ReadOnlyThreadMessage,
  type ReadOnlyThreadMessagePart,
  type ReadOnlyThreadProps
} from './components/ReadOnlyThread'
export { Sources } from './components/Sources'
export { TokenUsageBar } from './components/TokenUsageBar'
export { buildToolCallPart, ToolCallCard, type ToolCallCardProps } from './components/ToolCallPart'
// Types
export type { LinkComponent, LinkComponentProps, Source, ToolCall, UsageSnapshot } from './lib/types'
export { DefaultLink } from './lib/types'
// Provider + hook
export {
  type AgentChatContextValue,
  AgentChatProvider,
  type AgentChatProviderProps,
  type GenerateHref,
  useAgentChat
} from './runtime/AgentChatProvider'
