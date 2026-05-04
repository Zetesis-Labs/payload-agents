export type LlamaParseMode =
  | 'parse_page_without_llm'
  | 'parse_page_with_llm'
  | 'parse_page_with_lvm'
  | 'parse_page_with_agent'
  | 'parse_page_with_layout_agent'
  | 'parse_document_with_llm'
  | 'parse_document_with_lvm'
  | 'parse_document_with_agent'

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
