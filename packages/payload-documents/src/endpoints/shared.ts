import type { PayloadRequest } from 'payload'
import { LlamaParseClient } from '../llama-parse/client'
import type { ResolveFileBinary } from '../plugin/types'

export interface EndpointConfig {
  collectionSlug: string
  apiKey: string | undefined
  baseUrl: string
  worker?: WorkerEndpointConfig
}

export interface WorkerEndpointConfig {
  url: string
  internalSecret: string
  resolveFileBinary?: ResolveFileBinary
}

export interface DocumentRecord {
  id: string | number
  filename?: string | null
  url?: string | null
  mimeType?: string | null
  language?: string | null
  parsing_instruction?: string | null
  mode?: 'fast' | 'default' | 'premium' | null
  parse_status?: 'idle' | 'pending' | 'processing' | 'done' | 'error' | null
  parse_job_id?: string | null
  parse_error?: string | null
  parsed_at?: string | null
  parsed_text?: string | null
}

export const getLlamaParseClient = (config: EndpointConfig): LlamaParseClient | Response => {
  if (!config.apiKey) {
    return Response.json(
      { error: 'LlamaParse API key is not configured (set LLAMA_CLOUD_API_KEY or pass llamaParseApiKey).' },
      { status: 500 }
    )
  }
  return new LlamaParseClient({ apiKey: config.apiKey, baseUrl: config.baseUrl })
}

export const requireAuth = (req: PayloadRequest): Response | null => {
  if (!req.user) {
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

export const fetchDocument = async (
  req: PayloadRequest,
  collectionSlug: string,
  id: string
): Promise<DocumentRecord | Response> => {
  try {
    const doc = await req.payload.findByID({
      collection: collectionSlug,
      id,
      depth: 0,
      overrideAccess: false,
      req
    })
    return doc as unknown as DocumentRecord
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document not found'
    return Response.json({ error: message }, { status: 404 })
  }
}

export const fetchUploadedFile = async (
  req: PayloadRequest,
  doc: DocumentRecord
): Promise<{ blob: Blob; filename: string } | Response> => {
  if (!doc.url || !doc.filename) {
    return Response.json({ error: 'Document has no uploaded file yet.' }, { status: 400 })
  }

  // Payload sets `doc.url` to `${serverURL}${pathname}` when serverURL is
  // configured, so the URL comes back absolute with the browser-facing host
  // (e.g. https://nexus.localhost/api/documents/file/foo.pdf). That host is
  // typically unreachable from inside the server container, so we can't just
  // fetch it as-is. The file is served by Payload's own HTTP handler in this
  // same Node process, so rewrite any same-origin URL to
  // `http://localhost:${PORT}` (loopback = always reachable). URLs whose
  // origin differs from serverURL are treated as external (e.g. direct
  // S3/R2/MinIO links when `disablePayloadAccessControl: true`) and fetched
  // as-is.
  const port = process.env.PORT ?? '3000'
  const loopbackOrigin = `http://localhost:${port}`
  const serverURL = req.payload.config.serverURL
  const parsed = new URL(doc.url, loopbackOrigin)
  const serverOrigin = serverURL ? new URL(serverURL).origin : null
  const sameOrigin = !doc.url.startsWith('http') || (serverOrigin !== null && parsed.origin === serverOrigin)
  const absoluteUrl = sameOrigin ? `${loopbackOrigin}${parsed.pathname}${parsed.search}` : doc.url
  const cookieHeader = req.headers.get('cookie') ?? ''

  try {
    const res = await fetch(absoluteUrl, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined
    })
    if (!res.ok) {
      return Response.json(
        { error: `Failed to download uploaded file (${res.status} ${res.statusText})` },
        { status: 502 }
      )
    }
    const blob = await res.blob()
    return { blob, filename: doc.filename }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download uploaded file'
    return Response.json({ error: message }, { status: 502 })
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
