export interface TenantEntry {
  roles?: string[]
}

export interface AgentInfo {
  slug: string
  name: string
  avatar?: string
  welcomeTitle?: string
  welcomeSubtitle?: string
  suggestedQuestions?: Array<{ prompt: string; title: string; description: string }>
}

export type AgentLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

export interface SessionSummary {
  conversation_id: string
  title?: string
  last_activity: string
  status: 'active' | 'closed' | string
  agentSlug?: string
}

export interface ImageComponentProps {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
}
