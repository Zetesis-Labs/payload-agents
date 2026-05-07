import { z } from 'zod'

export const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  type: z.string()
})

export const SessionRowSchema = z.object({
  conversationId: z.string(),
  agentSlug: z.string(),
  model: z.string(),
  userId: z.number(),
  userLabel: z.string(),
  tenantId: z.number(),
  tenantLabel: z.string(),
  runs: z.number(),
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  firstRunAt: z.string(),
  lastRunAt: z.string(),
  durationMs: z.number(),
  totalLatencyMs: z.number(),
  errors: z.number(),
  firstMessage: z.string().nullable()
})
export type SessionRow = z.infer<typeof SessionRowSchema>

export const SessionsResponseSchema = z.object({
  sessions: z.array(SessionRowSchema),
  totals: z.object({
    sessions: z.number(),
    runs: z.number(),
    costUsd: z.number(),
    totalTokens: z.number()
  }),
  page: z.number(),
  totalPages: z.number()
})
export type SessionsResponse = z.infer<typeof SessionsResponseSchema>

export const SessionMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        input: z.record(z.unknown()),
        result: z.string().optional(),
        sources: z.array(SourceSchema).optional()
      })
    )
    .optional(),
  sources: z.array(SourceSchema).optional()
})
export type SessionMessage = z.infer<typeof SessionMessageSchema>

export const SessionDetailResponseSchema = z.object({
  messages: z.array(SessionMessageSchema)
})

export const GroupBySchema = z.enum(['tenant', 'agent', 'user', 'model', 'apiKeySource', 'apiKeyFingerprint', 'day'])
export type GroupBy = z.infer<typeof GroupBySchema>

export const BucketRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  keys: z.record(z.string()),
  labels: z.record(z.string()),
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  events: z.number()
})
export type BucketRow = z.infer<typeof BucketRowSchema>

export const SeriesRowSchema = z.object({
  day: z.string(),
  totalTokens: z.number(),
  costUsd: z.number(),
  events: z.number()
})
export type SeriesRow = z.infer<typeof SeriesRowSchema>

export const AggregateResponseSchema = z.object({
  groupBy: z.array(GroupBySchema),
  totals: z.object({
    totalTokens: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
    events: z.number()
  }),
  buckets: z.array(BucketRowSchema),
  topBuckets: z.array(BucketRowSchema),
  bucketsPage: z.number(),
  bucketsTotalPages: z.number(),
  bucketsTotal: z.number(),
  series: z.array(SeriesRowSchema)
})
export type AggregateResponse = z.infer<typeof AggregateResponseSchema>
