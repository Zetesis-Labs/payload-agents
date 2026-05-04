import type { Endpoint, PayloadRequest } from 'payload'
import { type EndpointConfig, getRouteId, type WorkerEndpointConfig } from './shared'

/**
 * Internal binary endpoint: streams the upload attached to a document back to
 * the worker. The plugin doesn't know how to read from the host's storage
 * (S3, R2, local fs, …), so the actual fetch is delegated to the host via the
 * `worker.resolveFileBinary` callback.
 *
 * Same trust model as `parse-context` and `parse-result`: gated by
 * `X-Internal-Secret`, document loaded with `overrideAccess: true`, only
 * registered when worker mode is enabled AND the host wired a resolver.
 */

const requireInternalSecret = (req: PayloadRequest, worker: WorkerEndpointConfig): Response | null => {
  const headerSecret = req.headers?.get?.('x-internal-secret')
  if (!headerSecret || headerSecret !== worker.internalSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export const createParseFileEndpoint = (config: EndpointConfig): Endpoint => ({
  path: '/:id/parse-file',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const worker = config.worker
    if (!worker?.resolveFileBinary) {
      return Response.json({ error: 'Worker file resolver not configured' }, { status: 404 })
    }

    const authError = requireInternalSecret(req, worker)
    if (authError) return authError

    const idOrError = getRouteId(req)
    if (idOrError instanceof Response) return idOrError
    const id = idOrError

    let doc: Record<string, unknown>
    try {
      doc = (await req.payload.findByID({
        collection: config.collectionSlug,
        id,
        depth: 0,
        overrideAccess: true,
        req
      })) as Record<string, unknown>
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document not found'
      return Response.json({ error: message }, { status: 404 })
    }

    try {
      const file = await worker.resolveFileBinary({ doc, req })
      const headers: Record<string, string> = {
        'Content-Type': file.contentType ?? 'application/octet-stream'
      }
      if (file.contentLength !== undefined) {
        headers['Content-Length'] = String(file.contentLength)
      }
      return new Response(file.body, { headers })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resolve file binary'
      return Response.json({ error: message }, { status: 502 })
    }
  }
})
