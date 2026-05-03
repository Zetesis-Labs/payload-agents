import type { Config, Endpoint } from 'payload'
import { createParseEndpoint } from '../endpoints/parse-endpoint'
import { createParseResultEndpoint } from '../endpoints/parse-result-endpoint'
import { createParseStatusEndpoint } from '../endpoints/parse-status-endpoint'
import { DEFAULT_LLAMA_PARSE_BASE_URL } from '../llama-parse/client'
import { buildDocumentsCollection } from './build-collection'
import { DEFAULT_COLLECTION_SLUG, type DocumentsPluginConfig, type DocumentsPluginResult } from './types'

export const createDocumentsPlugin = (options: DocumentsPluginConfig = {}): DocumentsPluginResult => {
  const slug = options.collectionSlug ?? DEFAULT_COLLECTION_SLUG
  const baseUrl = options.llamaParseBaseUrl ?? DEFAULT_LLAMA_PARSE_BASE_URL

  const plugin = (payloadConfig: Config): Config => {
    const apiKey = options.llamaParseApiKey ?? process.env.LLAMA_CLOUD_API_KEY

    const endpointConfig = { collectionSlug: slug, apiKey, baseUrl, worker: options.worker }

    const endpoints: Endpoint[] = [createParseEndpoint(endpointConfig), createParseStatusEndpoint(endpointConfig)]
    // Internal write endpoint only exists when worker mode is on. It bypasses
    // collection access via overrideAccess + a shared X-Internal-Secret header,
    // so leaving it off when the worker isn't wired keeps the surface minimal.
    if (options.worker) {
      endpoints.push(createParseResultEndpoint(endpointConfig))
    }

    let collection = buildDocumentsCollection(slug)
    collection = {
      ...collection,
      endpoints: [...(collection.endpoints ? collection.endpoints : []), ...endpoints]
    }
    if (options.overrides?.collection) {
      collection = options.overrides.collection(collection)
    }

    payloadConfig.collections = [...(payloadConfig.collections ?? []), collection]

    return payloadConfig
  }

  return { plugin }
}
