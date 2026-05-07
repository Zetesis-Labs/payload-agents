import type React from 'react'
import { FloatingChatWrapper } from '@/components/floating-chat-wrapper'
import { UserProvider } from '@/components/user-context'
import './index.css'

export const metadata = {
  title: 'Payload Agents — Playground',
  description: 'Dev playground for payload-agents packages'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className="dark" lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <UserProvider>
          {children}
          <FloatingChatWrapper />
        </UserProvider>
      </body>
    </html>
  )
}
