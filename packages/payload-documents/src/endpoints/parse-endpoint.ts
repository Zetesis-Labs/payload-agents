import type { Endpoint, PayloadRequest } from 'payload'
import {
  type EndpointConfig,
  fetchDocument,
  fetchUploadedFile,
  getLlamaParseClient,
  getRouteId,
  requireAuth,
  updateDocument
} from './shared'

export const createParseEndpoint = (config: EndpointConfig): Endpoint => ({
  path: `/${config.collectionSlug}/:id/parse`,
  method: 'post',
  handler: async (req: PayloadRequest) => {
    const authError = requireAuth(req)
    if (authError) return authError

    const idOrError = getRouteId(req)
    if (idOrError instanceof Response) return idOrError
    const id = idOrError

    const clientOrError = getLlamaParseClient(config)
    if (clientOrError instanceof Response) return clientOrError
    const client = clientOrError

    const docOrError = await fetchDocument(req, config.collectionSlug, id)
    if (docOrError instanceof Response) return docOrError
    const doc = docOrError

    const fileOrError = await fetchUploadedFile(req, doc)
    if (fileOrError instanceof Response) return fileOrError
    const { blob, filename } = fileOrError

    try {
      const job = await client.upload(blob, filename, {
        language: doc.language ?? undefined,
        parsingInstruction: doc.parsing_instruction ?? undefined,
        mode: doc.mode ?? 'default'
      })

      await updateDocument(req, config.collectionSlug, id, {
        parse_job_id: job.id,
        parse_status: 'pending',
        parse_error: null
      })

      return Response.json({ job_id: job.id, status: 'pending' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LlamaParse upload failed'
      await updateDocument(req, config.collectionSlug, id, {
        parse_status: 'error',
        parse_error: message
      })
      return Response.json({ error: message }, { status: 500 })
    }
  }
})
