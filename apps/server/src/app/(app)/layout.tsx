import type React from 'react'

export const metadata = {
  title: 'Payload Agents — Playground',
  description: 'Dev playground for payload-agents packages'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
