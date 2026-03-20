import { saveChatSession } from '@zetesis/payload-typesense'
import type { RAGCallbacks } from '@zetesis/payload-typesense'
import type { PayloadRequest } from 'payload'
import { getPayload } from '@/modules/get-payload'

export const callbacks: RAGCallbacks = {
  getPayload,

  checkPermissions: async (request: PayloadRequest) => {
    return !!request.user?.id
  },

  saveChatSession
}
