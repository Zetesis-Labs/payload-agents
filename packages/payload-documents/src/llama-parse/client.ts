import type { LlamaParseJob, LlamaParseJobDetails, LlamaParseUploadOptions } from './types'

export const DEFAULT_LLAMA_PARSE_BASE_URL = 'https://api.cloud.llamaindex.ai/api/v1'

export interface LlamaParseClientConfig {
  apiKey: string
  baseUrl?: string
}

export class LlamaParseClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(config: LlamaParseClientConfig) {
    if (!config.apiKey) {
      throw new Error('LlamaParse API key is required')
    }
    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl ?? DEFAULT_LLAMA_PARSE_BASE_URL).replace(/\/$/, '')
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` }
  }

  async upload(file: Blob, filename: string, opts: LlamaParseUploadOptions = {}): Promise<LlamaParseJob> {
    const form = new FormData()
    form.append('file', file, filename)
    form.append('result_type', 'markdown')
    if (opts.language) form.append('language', opts.language)
    if (opts.parsingInstruction) form.append('parsing_instruction', opts.parsingInstruction)
    const mode = opts.mode ?? 'default'
    if (mode === 'fast') form.append('fast_mode', 'true')
    if (mode === 'premium') form.append('premium_mode', 'true')

    const res = await fetch(`${this.baseUrl}/parsing/upload`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: form
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`LlamaParse upload failed (${res.status}): ${body || res.statusText}`)
    }

    const data = (await res.json()) as LlamaParseJob
    return data
  }

  async getJobStatus(id: string): Promise<LlamaParseJobDetails> {
    const res = await fetch(`${this.baseUrl}/parsing/job/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: this.authHeaders()
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`LlamaParse job status failed (${res.status}): ${body || res.statusText}`)
    }

    const data = (await res.json()) as LlamaParseJobDetails
    return data
  }

  async getMarkdown(id: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/parsing/job/${encodeURIComponent(id)}/result/markdown`, {
      method: 'GET',
      headers: this.authHeaders()
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`LlamaParse markdown fetch failed (${res.status}): ${body || res.statusText}`)
    }

    const data = (await res.json()) as { markdown?: string }
    if (typeof data.markdown !== 'string') {
      throw new Error('LlamaParse markdown response missing `markdown` field')
    }
    return data.markdown
  }
}
