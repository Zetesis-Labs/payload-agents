'use client'

import { Button, Pill, toast, useFormFields } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'
import { useCallback, useRef, useState } from 'react'

type ParseStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error'

const labels: Record<ParseStatus, string> = {
  idle: 'Idle',
  pending: 'Pending',
  processing: 'Processing',
  done: 'Done',
  error: 'Error'
}

const pillStyle: Record<ParseStatus, 'success' | 'error' | 'warning' | undefined> = {
  idle: undefined,
  pending: 'warning',
  processing: 'warning',
  done: 'success',
  error: 'error'
}

const POLL_INTERVAL_MS = 3000

const parseUrlContext = (): { slug?: string; id?: string } => {
  if (typeof window === 'undefined') return {}
  const match = window.location.pathname.match(/\/admin\/collections\/([^/]+)\/([^/?#]+)/)
  if (!match) return {}
  const [, slug, id] = match
  if (!id || id === 'create') return { slug }
  return { slug, id }
}

export const ParseButtonField: UIFieldClientComponent = () => {
  const persistedStatus = useFormFields(([fields]) => {
    const raw = fields?.parse_status?.value
    return typeof raw === 'string' ? (raw as ParseStatus) : 'idle'
  })

  const [busy, setBusy] = useState(false)
  const [localStatus, setLocalStatus] = useState<ParseStatus | null>(null)
  const pollingRef = useRef<number | null>(null)

  const status: ParseStatus = localStatus ?? persistedStatus ?? 'idle'

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setBusy(false)
  }, [])

  const startPolling = useCallback(
    (slug: string, id: string) => {
      stopPolling()
      setBusy(true)
      pollingRef.current = window.setInterval(async () => {
        try {
          const res = await fetch(`/api/${slug}/${id}/parse-status`)
          const data = (await res.json()) as { status?: ParseStatus; error?: string }
          const next = data.status ?? 'processing'
          setLocalStatus(next)
          if (next === 'done') {
            stopPolling()
            toast.success('Document parsed')
            window.location.reload()
          } else if (next === 'error') {
            stopPolling()
            toast.error(data.error ?? 'Parse failed')
          }
        } catch {
          // keep polling on transient errors
        }
      }, POLL_INTERVAL_MS)
    },
    [stopPolling]
  )

  const handleClick = useCallback(async () => {
    const { slug, id } = parseUrlContext()
    if (!slug || !id) {
      toast.error('Save the document before parsing.')
      return
    }

    setBusy(true)
    setLocalStatus('pending')
    try {
      const res = await fetch(`/api/${slug}/${id}/parse`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setBusy(false)
        setLocalStatus('error')
        toast.error(data.error ?? `Parse failed (HTTP ${res.status})`)
        return
      }
      toast.success('Parsing started')
      startPolling(slug, id)
    } catch (error) {
      setBusy(false)
      setLocalStatus('error')
      toast.error(error instanceof Error ? error.message : 'Network error')
    }
  }, [startPolling])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <strong>LlamaParse</strong>
        <Pill pillStyle={pillStyle[status]} size="small">
          {labels[status]}
        </Pill>
      </div>
      <div>
        <Button buttonStyle="primary" size="small" onClick={handleClick} disabled={busy}>
          {busy ? 'Parsing…' : 'Parse with LlamaParse'}
        </Button>
      </div>
    </div>
  )
}
