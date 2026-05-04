import type { PayloadRequest } from 'payload'
import type { DocumentRecord, DocumentsWorkerConfig } from '../plugin/types'

export interface EndpointConfig {
  collectionSlug: string
  apiKey: string | undefined
  baseUrl: string
  worker?: DocumentsWorkerConfig
}

export type { DocumentRecord }

const INTERNAL_SECRET_HEADER = 'x-internal-secret'

export const requireAuth = (req: PayloadRequest): Response | null => {
  if (!req.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export const requireInternalSecret = (req: PayloadRequest, worker: DocumentsWorkerConfig): Response | null => {
  const headerSecret = req.headers?.get?.(INTERNAL_SECRET_HEADER)
  if (!headerSecret || headerSecret !== worker.internalSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export const getRouteId = (req: PayloadRequest): string | Response => {
  const id = req.routeParams?.id
  if (typeof id !== 'string' || id.length === 0) {
    return Response.json({ error: 'Missing id' }, { status: 400 })
  }
  return id
}

/**
 * Loads a document subject to the host's collection access (uses the request's
 * `req.user`). Used by the user-facing inline endpoints.
 */
export const fetchDocument = async (
  req: PayloadRequest,
  collectionSlug: string,
  id: string
): Promise<DocumentRecord | Response> => loadDocument(req, collectionSlug, id, { overrideAccess: false })

/**
 * Loads a document bypassing collection access. Used by the internal worker
 * endpoints, which gate on `X-Internal-Secret` instead of user-level access.
 */
export const fetchInternalDocument = async (
  req: PayloadRequest,
  collectionSlug: string,
  id: string
): Promise<DocumentRecord | Response> => loadDocument(req, collectionSlug, id, { overrideAccess: true })

const loadDocument = async (
  req: PayloadRequest,
  collectionSlug: string,
  id: string,
  opts: { overrideAccess: boolean }
): Promise<DocumentRecord | Response> => {
  try {
    const doc = await req.payload.findByID({
      collection: collectionSlug,
      id,
      depth: 0,
      overrideAccess: opts.overrideAccess,
      req
    })
    return doc as unknown as DocumentRecord
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document not found'
    return Response.json({ error: message }, { status: 404 })
  }
}

export const updateDocument = async (
  req: PayloadRequest,
  collectionSlug: string,
  id: string,
  data: Partial<DocumentRecord>
): Promise<void> => {
  await req.payload.update({
    collection: collectionSlug,
    id,
    data: data as Record<string, unknown>,
    depth: 0,
    overrideAccess: true,
    req
  })
}
