// Plugin

// Query types (for building custom dashboards)
export type { AggregateFilters, BucketRow, GroupBy, SeriesRow, Totals } from './lib/aggregate-query'
// Lib (for advanced consumers)
export { calculateLlmCost, type LlmProvider, normalizeProvider } from './lib/cost-calculator'
export { createOnRunCompleted } from './lib/on-run-completed'
export type { SessionFilters, SessionRow, SessionsResult, SessionTotals } from './lib/sessions-query'
export { metricsPlugin } from './plugin'
// Types
export type {
  AccessResult,
  MetricsPluginConfig,
  ResolvedMetricsConfig
} from './types'
