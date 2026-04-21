import type { Endpoint, PayloadRequest } from 'payload'
import type { LlamaParseClient } from '../llama-parse/client'
import type { LlamaParseJobStatus } from '../llama-parse/types'
import {
  type DocumentRecord,
  type EndpointConfig,
  fetchDocument,
  getLlamaParseClient,
  getRouteId,
  requireAuth,
  updateDocument
} from './shared'

const isTerminal = (status: DocumentRecord['parse_status']): boolean =>
  !status || status === 'idle' || status === 'done' || status === 'error'

interface ResolveArgs {
  req: PayloadRequest
  client: LlamaParseClient
  config: EndpointConfig
  id: string
  jobId: string
  currentStatus: DocumentRecord['parse_status']
}

const handleProcessing = async ({ req, config, id, currentStatus }: ResolveArgs): Promise<Response> => {
  if (currentStatus !== 'processing') {
    await updateDocument(req, config.collectionSlug, id, { parse_status: 'processing' })
  }
  return Response.json({ status: 'processing' })
}

const handleError = async ({ req, config, id }: ResolveArgs, errorMessage: string | undefined): Promise<Response> => {
  const message = errorMessage ?? 'LlamaParse job failed'
  await updateDocument(req, config.collectionSlug, id, {
    parse_status: 'error',
    parse_error: message
  })
  return Response.json({ status: 'error', error: message })
}

const handleSuccess = async ({ req, client, config, id, jobId }: ResolveArgs): Promise<Response> => {
  const markdown = await client.getMarkdown(jobId)
  await updateDocument(req, config.collectionSlug, id, {
    parse_status: 'done',
    parse_error: null,
    parsed_at: new Date().toISOString(),
    parsed_text: markdown
  })
  return Response.json({ status: 'done' })
}

const resolveJob = async (
  args: ResolveArgs,
  jobStatus: LlamaParseJobStatus,
  errorMessage: string | undefined
): Promise<Response> => {
  if (jobStatus === 'SUCCESS') return handleSuccess(args)
  if (jobStatus === 'ERROR') return handleError(args, errorMessage)
  return handleProcessing(args)
}

export const createParseStatusEndpoint = (config: EndpointConfig): Endpoint => ({
  path: `/${config.collectionSlug}/:id/parse-status`,
  method: 'get',
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

    const currentStatus = doc.parse_status ?? 'idle'

    if (!doc.parse_job_id || isTerminal(currentStatus)) {
      return Response.json({ status: currentStatus })
    }

    const args: ResolveArgs = {
      req,
      client,
      config,
      id,
      jobId: doc.parse_job_id,
      currentStatus
    }

    try {
      const job = await client.getJobStatus(doc.parse_job_id)
      return await resolveJob(args, job.status, job.error_message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LlamaParse status check failed'
      await updateDocument(req, config.collectionSlug, id, {
        parse_status: 'error',
        parse_error: message
      })
      return Response.json({ status: 'error', error: message }, { status: 500 })
    }
  }
})
