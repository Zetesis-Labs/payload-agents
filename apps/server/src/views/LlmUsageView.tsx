'use client'

import { LlmUsageDashboard } from '@zetesis/payload-agents-metrics/client'
import Link from 'next/link'

export default function LlmUsageView() {
  return (
    <div className="llm-usage-dashboard">
      <LlmUsageDashboard basePath="/metrics" LinkComponent={Link} />
    </div>
  )
}
