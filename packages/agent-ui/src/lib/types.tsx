import type React from 'react'

export interface LinkComponentProps {
  href: string
  children: React.ReactNode
  onClick?: () => void
  className?: string
  target?: string
  'aria-label'?: string
  title?: string
}

export type LinkComponent = React.ComponentType<LinkComponentProps>

export const DefaultLink: LinkComponent = ({
  href,
  children,
  onClick,
  className,
  target,
  'aria-label': ariaLabel,
  title
}) => (
  <a href={href} onClick={onClick} className={className} target={target} aria-label={ariaLabel} title={title}>
    {children}
  </a>
)

export interface Source {
  id: string
  title: string
  slug: string
  type: string
  chunkIndex?: number
  /** Full chunk content (markdown). Rendered in the expandable preview. */
  content?: string
  /** Short excerpt (typically first ~200 chars). */
  excerpt?: string
  /** Vector-distance score; lower is better. */
  relevanceScore?: number
}

export interface ToolCall {
  id: string
  name: string
  args?: Record<string, unknown>
  result?: string
  sources?: Source[]
  isLoading?: boolean
}

export interface UsageSnapshot {
  daily_limit: number
  daily_used: number
  daily_remaining: number
  reset_at: string
}
