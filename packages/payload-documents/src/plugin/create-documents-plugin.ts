import type { Config, Endpoint } from 'payload'
import { createParseContextEndpoint } from '../endpoints/parse-context-endpoint'
import { createParseEndpoint } from '../endpoints/parse-endpoint'
import { createParseFileEndpoint } from '../endpoints/parse-file-endpoint'
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
    // Internal endpoints only exist when worker mode is on. All three gate on
    // X-Internal-Secret and call Payload's local API with overrideAccess: true,
    // so the host's collection access can stay locked down. Reads project to a
    // hardcoded field set; writes accept a hardcoded whitelist; parse-file is
    // additionally gated on the host wiring `resolveFileBinary` since the
    // plugin can't read storage on its own.
    if (options.worker) {
      endpoints.push(createParseContextEndpoint(endpointConfig), createParseResultEndpoint(endpointConfig))
      if (options.worker.resolveFileBinary) {
        endpoints.push(createParseFileEndpoint(endpointConfig))
      }
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
