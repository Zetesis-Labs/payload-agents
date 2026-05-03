import type { Endpoint, PayloadRequest } from 'payload'
import { type DocumentRecord, type EndpointConfig, getRouteId, type WorkerEndpointConfig } from './shared'

/**
 * Internal read endpoint paired with `parse-result-endpoint`. Returns only the
 * fields the worker needs to drive the LlamaParse upload (the file URL, the
 * filename, and the parser knobs the document carries).
 *
 * Same trust model as the write endpoint: gated by `X-Internal-Secret`, scoped
 * to a hard-coded projection of fields, calls Payload's local API with
 * `overrideAccess: true`. Lets host apps keep the documents collection's read
 * access locked down (multi-tenant filters, role gates, etc.) without poking
 * a service-account bypass into the access function.
 *
 * Only registered when worker mode is enabled.
 */

const PROJECTION = [
  'id',
  'url',
  'filename',
  'mimeType',
  'language',
  'parsing_instruction',
  'mode'
] as const satisfies ReadonlyArray<keyof DocumentRecord>

type ContextField = (typeof PROJECTION)[number]
type ParseContext = Pick<DocumentRecord, ContextField>

const requireInternalSecret = (req: PayloadRequest, worker: WorkerEndpointConfig): Response | null => {
  const headerSecret = req.headers?.get?.('x-internal-secret')
  if (!headerSecret || headerSecret !== worker.internalSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

const projectContext = (doc: Record<string, unknown>): ParseContext => {
  const out = {} as Record<string, unknown>
  for (const key of PROJECTION) {
    if (key in doc) out[key] = doc[key]
  }
  return out as ParseContext
}

export const createParseContextEndpoint = (config: EndpointConfig): Endpoint => ({
  path: '/:id/parse-context',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    if (!config.worker) {
      return Response.json({ error: 'Worker mode not enabled' }, { status: 404 })
    }

    const authError = requireInternalSecret(req, config.worker)
    if (authError) return authError

    const idOrError = getRouteId(req)
    if (idOrError instanceof Response) return idOrError
    const id = idOrError

    try {
      const doc = await req.payload.findByID({
        collection: config.collectionSlug,
        id,
        depth: 0,
        overrideAccess: true,
        req
      })
      return Response.json(projectContext(doc as Record<string, unknown>))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document not found'
      return Response.json({ error: message }, { status: 404 })
    }
  }
})
