import type { Endpoint, PayloadRequest } from 'payload'
import type { DocumentRecord } from '../plugin/types'
import { type EndpointConfig, fetchInternalDocument, getRouteId, requireInternalSecret } from './shared'

/**
 * Internal read endpoint paired with `parse-result-endpoint`. Returns only the
 * fields the worker needs to drive the LlamaParse upload (the file URL, the
 * filename, and the parser knobs the document carries).
 *
 * Same trust model as the write endpoint: gated by `X-Internal-Secret`, scoped
 * to a hard-coded projection of fields, calls Payload's local API with
 * `overrideAccess: true`.
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

type ParseContext = Pick<DocumentRecord, (typeof PROJECTION)[number]>

const projectContext = (doc: DocumentRecord): ParseContext => {
  const out: Partial<ParseContext> = {}
  for (const key of PROJECTION) {
    if (key in doc) {
      ;(out as Record<string, unknown>)[key] = doc[key]
    }
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

    const docOrError = await fetchInternalDocument(req, config.collectionSlug, id)
    if (docOrError instanceof Response) return docOrError

    return Response.json(projectContext(docOrError))
  }
})
