import type { Endpoint, PayloadRequest } from 'payload'
import type { LlamaParseClient } from '../llama-parse/client'
import type { LlamaParseJobStatus } from '../llama-parse/types'
import type { DocumentRecord } from '../plugin/types'
import { getLlamaParseClient } from './inline-helpers'
import { type EndpointConfig, fetchDocument, getRouteId, requireAuth, updateDocument } from './shared'

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
  if (jobStatus === 'CANCELED') return handleError(args, errorMessage ?? 'LlamaParse job was canceled')
  return handleProcessing(args)
}

async function handleWorkerMode(req: PayloadRequest, config: EndpointConfig, id: string): Promise<Response> {
  const docOrError = await fetchDocument(req, config.collectionSlug, id)
  if (docOrError instanceof Response) return docOrError
  const status = docOrError.parse_status ?? 'idle'
  const body: { status: string; error?: string } = { status }
  if (status === 'error' && docOrError.parse_error) body.error = docOrError.parse_error
  return Response.json(body)
}

async function pollLlamaParseStatus(args: ResolveArgs): Promise<Response> {
  try {
    const job = await args.client.getJobStatus(args.jobId)
    return await resolveJob(args, job.status, job.error_message)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LlamaParse status check failed'
    await updateDocument(args.req, args.config.collectionSlug, args.id, {
      parse_status: 'error',
      parse_error: message
    })
    return Response.json({ status: 'error', error: message }, { status: 500 })
  }
}

async function handleInlineMode(req: PayloadRequest, config: EndpointConfig, id: string): Promise<Response> {
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

  return pollLlamaParseStatus({
    req,
    client,
    config,
    id,
    jobId: doc.parse_job_id,
    currentStatus
  })
}

export const createParseStatusEndpoint = (config: EndpointConfig): Endpoint => ({
  path: '/:id/parse-status',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const authError = requireAuth(req)
    if (authError) return authError

    const idOrError = getRouteId(req)
    if (idOrError instanceof Response) return idOrError
    const id = idOrError

    // In worker mode the parse runs out-of-process and the worker writes
    // `parsed_text` / `parse_status` directly via Payload REST. The status
    // endpoint becomes a passive read of whatever the worker last stamped.
    if (config.worker) return handleWorkerMode(req, config, id)
    return handleInlineMode(req, config, id)
  }
})
