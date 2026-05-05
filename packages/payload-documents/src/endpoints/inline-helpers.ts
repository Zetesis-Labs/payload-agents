import type { PayloadRequest } from 'payload'
import { LlamaParseClient } from '../llama-parse/client'
import type { DocumentRecord } from '../plugin/types'
import type { EndpointConfig } from './shared'

/**
 * Helpers used only by the inline LlamaParse path (parse + parse-status
 * endpoints when worker mode is OFF). Kept out of `shared.ts` because the
 * three internal worker endpoints don't need them.
 */

export const getLlamaParseClient = (config: EndpointConfig): LlamaParseClient | Response => {
  if (!config.apiKey) {
    return Response.json(
      {
        error: 'LlamaParse API key is not configured (set LLAMA_CLOUD_API_KEY or pass llamaParseApiKey).'
      },
      { status: 500 }
    )
  }
  return new LlamaParseClient({ apiKey: config.apiKey, baseUrl: config.baseUrl })
}

export const fetchUploadedFile = async (
  req: PayloadRequest,
  doc: DocumentRecord
): Promise<{ blob: Blob; filename: string } | Response> => {
  if (!doc.url || !doc.filename) {
    return Response.json({ error: 'Document has no uploaded file yet.' }, { status: 400 })
  }

  const absoluteUrl = rewriteToLoopback(req, doc.url)
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

/**
 * Payload sets `doc.url` to `${serverURL}${pathname}` when serverURL is
 * configured, so it comes back absolute with the browser-facing host (e.g.
 * `https://nexus.localhost/api/documents/file/foo.pdf`). That host is
 * typically unreachable from inside the server container, so we rewrite any
 * same-origin URL to `http://localhost:${PORT}` (loopback = always reachable).
 * URLs whose origin differs from serverURL are treated as external (e.g.
 * direct S3/R2/MinIO links when `disablePayloadAccessControl: true`) and
 * fetched as-is.
 */
const rewriteToLoopback = (req: PayloadRequest, url: string): string => {
  const port = process.env.PORT ?? '3000'
  const loopbackOrigin = `http://localhost:${port}`
  const serverURL = req.payload.config.serverURL
  const parsed = new URL(url, loopbackOrigin)
  const serverOrigin = serverURL ? new URL(serverURL).origin : null
  const sameOrigin = !url.startsWith('http') || (serverOrigin !== null && parsed.origin === serverOrigin)
  return sameOrigin ? `${loopbackOrigin}${parsed.pathname}${parsed.search}` : url
}
