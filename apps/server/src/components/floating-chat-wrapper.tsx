'use client'

import { FloatingChatManager } from '@zetesis/chat-agent'
import Image from 'next/image'
import Link from 'next/link'
import { useUser } from '@/components/user-context'

export function FloatingChatWrapper() {
  return (
    <FloatingChatManager
      useUser={useUser}
      generateHref={({ type, value }) => `/${type}/${value.slug || value.id}`}
      LinkComponent={Link}
      ImageComponent={Image}
    />
  )
}
