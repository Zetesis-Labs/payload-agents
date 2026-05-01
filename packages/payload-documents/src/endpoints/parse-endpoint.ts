import type { Endpoint, PayloadRequest } from 'payload'
import {
  type EndpointConfig,
  type WorkerEndpointConfig,
  fetchDocument,
  fetchUploadedFile,
  getLlamaParseClient,
  getRouteId,
  requireAuth,
  updateDocument
} from './shared'

export const createParseEndpoint = (config: EndpointConfig): Endpoint => ({
  path: '/:id/parse',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    const authError = requireAuth(req)
    if (authError) return authError

    const idOrError = getRouteId(req)
    if (idOrError instanceof Response) return idOrError
    const id = idOrError

    if (config.worker) {
      return queueOnWorker(req, config.collectionSlug, id, config.worker)
    }

    return runInline(req, config, id)
  }
})

const queueOnWorker = async (
  req: PayloadRequest,
  collectionSlug: string,
  id: string,
  worker: WorkerEndpointConfig
): Promise<Response> => {
  await updateDocument(req, collectionSlug, id, {
    parse_status: 'pending',
    parse_error: null,
    parse_job_id: null
  })

  try {
    const res = await fetch(`${worker.url.replace(/\/$/, '')}/tasks/parse-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': worker.internalSecret
      },
      body: JSON.stringify({ document_id: id })
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      const message = `Worker rejected parse request (HTTP ${res.status}): ${detail.slice(0, 200)}`
      await updateDocument(req, collectionSlug, id, {
        parse_status: 'error',
        parse_error: message
      })
      return Response.json({ error: message }, { status: 502 })
    }

    return Response.json({ status: 'queued' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker is unreachable'
    await updateDocument(req, collectionSlug, id, {
      parse_status: 'error',
      parse_error: message
    })
    return Response.json({ error: message }, { status: 502 })
  }
}

const runInline = async (req: PayloadRequest, config: EndpointConfig, id: string): Promise<Response> => {
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
