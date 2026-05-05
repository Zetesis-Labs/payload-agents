import type { Endpoint, PayloadRequest } from 'payload'
import { type EndpointConfig, fetchInternalDocument, getRouteId, requireInternalSecret } from './shared'

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

    const docOrError = await fetchInternalDocument(req, config.collectionSlug, id)
    if (docOrError instanceof Response) return docOrError

    try {
      const file = await worker.resolveFileBinary({ doc: docOrError, req })
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
