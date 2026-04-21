export type LlamaParseMode = 'fast' | 'default' | 'premium'

export type LlamaParseJobStatus = 'PENDING' | 'SUCCESS' | 'ERROR' | 'CANCELED'

export interface LlamaParseUploadOptions {
  language?: string
  parsingInstruction?: string
  mode?: LlamaParseMode
}

export interface LlamaParseJob {
  id: string
  status: LlamaParseJobStatus
}

export interface LlamaParseJobDetails extends LlamaParseJob {
  error_message?: string
}
