'use client'

import { ChatProvider } from '@zetesis/chat-agent'
import { LlmUsageDashboard } from '@zetesis/payload-agents-metrics/client'
import Link from 'next/link'

export default function LlmUsageView() {
  return (
    <ChatProvider>
      <div className="llm-usage-dashboard">
        <LlmUsageDashboard basePath="/metrics" LinkComponent={Link} />
      </div>
    </ChatProvider>
  )
}
