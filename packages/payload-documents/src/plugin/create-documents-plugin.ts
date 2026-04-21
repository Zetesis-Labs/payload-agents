import type { Config } from 'payload'
import { createParseEndpoint } from '../endpoints/parse-endpoint'
import { createParseStatusEndpoint } from '../endpoints/parse-status-endpoint'
import { DEFAULT_LLAMA_PARSE_BASE_URL } from '../llama-parse/client'
import { buildDocumentsCollection } from './build-collection'
import { DEFAULT_COLLECTION_SLUG, type DocumentsPluginConfig, type DocumentsPluginResult } from './types'

export const createDocumentsPlugin = (options: DocumentsPluginConfig = {}): DocumentsPluginResult => {
  const slug = options.collectionSlug ?? DEFAULT_COLLECTION_SLUG
  const baseUrl = options.llamaParseBaseUrl ?? DEFAULT_LLAMA_PARSE_BASE_URL

  const plugin = (payloadConfig: Config): Config => {
    const apiKey = options.llamaParseApiKey ?? process.env.LLAMA_CLOUD_API_KEY

    let collection = buildDocumentsCollection(slug)
    if (options.overrides?.collection) {
      collection = options.overrides.collection(collection)
    }

    payloadConfig.collections = [...(payloadConfig.collections ?? []), collection]

    const endpointConfig = { collectionSlug: slug, apiKey, baseUrl }
    payloadConfig.endpoints = [
      ...(payloadConfig.endpoints ?? []),
      createParseEndpoint(endpointConfig),
      createParseStatusEndpoint(endpointConfig)
    ]

    return payloadConfig
  }

  return { plugin }
}
