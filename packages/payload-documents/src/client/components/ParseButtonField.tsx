'use client'

import { Button, Pill, toast, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ParseStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error'

const pillStyle: Record<ParseStatus, 'success' | 'error' | 'warning' | undefined> = {
  idle: undefined,
  pending: 'warning',
  processing: 'warning',
  done: 'success',
  error: 'error'
}

const labels: Record<ParseStatus, string> = {
  idle: 'Idle',
  pending: 'Pending',
  processing: 'Processing',
  done: 'Done',
  error: 'Error'
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '16px 0'
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
}

const descStyle: React.CSSProperties = {
  fontSize: '13px',
  opacity: 0.7
}

const POLL_INTERVAL_MS = 3000

export const ParseButtonField: UIFieldClientComponent = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const persistedStatus = useFormFields(([fields]) => {
    const raw = fields?.parse_status?.value
    return typeof raw === 'string' ? (raw as ParseStatus) : 'idle'
  })

  const [localStatus, setLocalStatus] = useState<ParseStatus | null>(null)
  const pollingRef = useRef<number | null>(null)

  const status: ParseStatus = localStatus ?? persistedStatus ?? 'idle'
  const isRunning = status === 'pending' || status === 'processing'

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const pollOnce = useCallback(async () => {
    if (!id || !collectionSlug) return
    try {
      const res = await fetch(`/api/${collectionSlug}/${id}/parse-status`)
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
        window.location.reload()
      }
    } catch {
      // keep polling; transient errors are fine
    }
  }, [id, collectionSlug, stopPolling])

  useEffect(() => stopPolling, [stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    pollingRef.current = window.setInterval(() => {
      void pollOnce()
    }, POLL_INTERVAL_MS)
  }, [pollOnce, stopPolling])

  // If the document was already in-flight when the user opened it, resume polling.
  useEffect(() => {
    if (persistedStatus === 'pending' || persistedStatus === 'processing') {
      startPolling()
    }
  }, [persistedStatus, startPolling])

  const handleStart = useCallback(async () => {
    if (!id || !collectionSlug) return
    setLocalStatus('pending')
    try {
      const res = await fetch(`/api/${collectionSlug}/${id}/parse`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setLocalStatus('error')
        toast.error(data.error ?? 'Failed to start parsing')
        return
      }
      toast.info('Parsing started')
      startPolling()
    } catch (error) {
      setLocalStatus('error')
      const message = error instanceof Error ? error.message : 'Failed to start parsing'
      toast.error(message)
    }
  }, [id, collectionSlug, startPolling])

  const description = useMemo(() => {
    switch (status) {
      case 'idle':
        return 'Click to parse the uploaded PDF with LlamaParse.'
      case 'pending':
        return 'Job accepted by LlamaParse. Waiting to start…'
      case 'processing':
        return 'LlamaParse is processing the document.'
      case 'done':
        return 'Parsed markdown is available in the Output tab.'
      case 'error':
        return 'Parsing failed. See the error details below.'
    }
  }, [status])

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <strong>LlamaParse</strong>
        <Pill pillStyle={pillStyle[status]} size="small">
          {labels[status]}
        </Pill>
      </div>
      <span style={descStyle}>{description}</span>
      {id && (
        <div>
          <Button buttonStyle="primary" size="small" onClick={handleStart} disabled={isRunning}>
            {isRunning ? 'Parsing…' : 'Parse with LlamaParse'}
          </Button>
        </div>
      )}
    </div>
  )
}
