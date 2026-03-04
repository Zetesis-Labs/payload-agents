'use client'

import { Pill } from '@payloadcms/ui'
import type { DefaultCellComponentProps } from 'payload'

type SyncStatus = 'synced' | 'outdated' | 'not-indexed' | 'error'

const pillStyles: Record<SyncStatus, 'success' | 'error' | 'warning' | 'light-gray'> = {
  synced: 'success',
  outdated: 'warning',
  'not-indexed': 'error',
  error: 'error'
}

const labels: Record<SyncStatus, string> = {
  synced: 'Synced',
  outdated: 'Outdated',
  'not-indexed': 'Not indexed',
  error: 'Error'
}

export const SyncStatusCell = ({ cellData }: DefaultCellComponentProps) => {
  const status = (cellData as SyncStatus) || 'not-indexed'
  return (
    <Pill pillStyle={pillStyles[status]} size="small">
      {labels[status]}
    </Pill>
  )
}
