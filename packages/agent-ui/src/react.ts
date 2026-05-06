'use client'

// Provider + hook
export {
  AgentChatProvider,
  useAgentChat,
  type AgentChatContextValue,
  type AgentChatProviderProps,
  type GenerateHref
} from './runtime/AgentChatProvider'

// Components
export { AgentThread, type AgentThreadProps } from './components/AgentThread'
export { AgentThreadList, type AgentThreadListProps, type SessionSummary } from './components/AgentThreadList'
export { LimitAlert } from './components/LimitAlert'
export { MarkdownText, type MarkdownTextProps } from './components/MarkdownText'
export { Sources } from './components/Sources'
export { TokenUsageBar } from './components/TokenUsageBar'
export { ToolCalls } from './components/ToolCalls'

// Types
export type { LinkComponent, LinkComponentProps, Source, ToolCall, UsageSnapshot } from './lib/types'
export { DefaultLink } from './lib/types'
