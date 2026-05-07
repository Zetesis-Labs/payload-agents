'use client'

import { useCallback, useState } from 'react'

export interface UsePanelStateResult {
  open: boolean
  maximized: boolean
  historyOpen: boolean
  openPanel: () => void
  closePanel: () => void
  toggleMaximized: () => void
  toggleHistory: () => void
  closeHistory: () => void
}

/**
 * Estado UI del panel flotante: apertura, maximizar, historial. Sin
 * lógica de datos — solo flags y los toggles que las views consumen.
 */
export function usePanelState(): UsePanelStateResult {
  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const openPanel = useCallback(() => setOpen(true), [])
  const closePanel = useCallback(() => setOpen(false), [])
  const toggleMaximized = useCallback(() => setMaximized(prev => !prev), [])
  const toggleHistory = useCallback(() => setHistoryOpen(prev => !prev), [])
  const closeHistory = useCallback(() => setHistoryOpen(false), [])

  return {
    open,
    maximized,
    historyOpen,
    openPanel,
    closePanel,
    toggleMaximized,
    toggleHistory,
    closeHistory
  }
}
