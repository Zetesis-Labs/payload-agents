import type { Endpoint, PayloadRequest } from 'payload'
import {
  type DocumentRecord,
  type EndpointConfig,
  getRouteId,
  updateDocument,
  type WorkerEndpointConfig
} from './shared'

/**
 * Internal write endpoint used by the documents worker to stamp parse results
 * back onto a document. Authenticated by `X-Internal-Secret` (shared with the
 * worker via `worker.internalSecret`), and scoped to a hard-coded whitelist of
 * fields. Calls Payload's local API with `overrideAccess: true`, so host apps
 * can keep their collection access control honestly admin-only without poking
 * service-account bypasses into it.
 *
 * Only registered when worker mode is enabled.
 */

const WRITABLE_FIELDS = [
  'parsed_text',
  'parse_status',
  'parse_error',
  'parse_job_id',
  'parsed_at'
] as const satisfies ReadonlyArray<keyof DocumentRecord>

type WritableField = (typeof WRITABLE_FIELDS)[number]
type ParseResultBody = Partial<Pick<DocumentRecord, WritableField>>

const pickWhitelisted = (body: unknown): ParseResultBody | null => {
  if (typeof body !== 'object' || body === null) return null
  const out: ParseResultBody = {}
  for (const key of WRITABLE_FIELDS) {
    if (key in body) {
      ;(out as Record<string, unknown>)[key] = (body as Record<string, unknown>)[key]
    }
  }
  return out
}

const requireInternalSecret = (req: PayloadRequest, worker: WorkerEndpointConfig): Response | null => {
  const headerSecret = req.headers?.get?.('x-internal-secret')
  if (!headerSecret || headerSecret !== worker.internalSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export const createParseResultEndpoint = (config: EndpointConfig): Endpoint => ({
  path: '/:id/parse-result',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!config.worker) {
      return Response.json({ error: 'Worker mode not enabled' }, { status: 404 })
    }

    const authError = requireInternalSecret(req, config.worker)
    if (authError) return authError

    const idOrError = getRouteId(req)
    if (idOrError instanceof Response) return idOrError
    const id = idOrError

    let rawBody: unknown
    try {
      rawBody = await req.json?.()
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const data = pickWhitelisted(rawBody)
    if (!data || Object.keys(data).length === 0) {
      return Response.json(
        { error: `Body must include at least one of: ${WRITABLE_FIELDS.join(', ')}` },
        { status: 400 }
      )
    }

    try {
      await updateDocument(req, config.collectionSlug, id, data)
      return Response.json({ id, status: 'ok' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed'
      return Response.json({ error: message }, { status: 500 })
    }
  }
})
