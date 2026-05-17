/**
 * Search Profiles collection.
 *
 * A `SearchProfile` is a tenant-owned, reusable bundle of retrieval
 * parameters: hard filters (taxonomies, folders), hybrid/topK params,
 * optional query rewrite template, and a reranker config (closure
 * resolved by the consumer at search time — typically `@zetesis/mcp-typesense`).
 *
 * Profiles are referenced from:
 * - `agents.defaultRetrievalProfile` (per-agent default)
 * - `mcp-search-tokens.retrievalProfile` (per-token override for external clients)
 * - any future caller that wants to scope a query
 *
 * The plugin only ships the collection definition; multi-tenant scoping
 * (registration in `@payloadcms/plugin-multi-tenant` + compound unique
 * on `(tenant, slug)`) is the consumer's responsibility, following the
 * same pattern this package uses for the agents collection.
 */

import type { CollectionConfig, Field } from 'payload'

export interface CreateSearchProfilesCollectionConfig {
  /** Override the Payload collection slug. Default: `'search-profiles'`. */
  collectionSlug?: string

  /** Slug of the taxonomy collection for hard filters. */
  taxonomyCollectionSlug: string

  /**
   * Slug of the folders collection for hard filters. Defaults to
   * `'payload-folders'` (Payload's auto-injected folders slug).
   */
  foldersCollectionSlug?: string

  /**
   * Transform the SearchProfiles collection config before it is registered.
   * Same pattern as `agentPlugin`'s `collectionOverrides`: spread the
   * generated config and override only what you need.
   */
  collectionOverrides?: (config: CollectionConfig) => CollectionConfig
}

/**
 * Allowed reranker providers shipped by `@zetesis/mcp-typesense`. New
 * providers can be added without bumping this enum if the consumer uses a
 * custom reranker factory. The `model` field on the profile names which
 * model to use within the selected provider.
 */
export const SEARCH_PROFILE_RERANKER_KINDS = ['none', 'deepinfra', 'jina', 'tei'] as const

export type SearchProfileRerankerKind = (typeof SEARCH_PROFILE_RERANKER_KINDS)[number]

const rerankerKindOptions: Array<{ label: string; value: SearchProfileRerankerKind }> = [
  { label: 'None (passthrough)', value: 'none' },
  { label: 'DeepInfra', value: 'deepinfra' },
  { label: 'Jina AI (direct)', value: 'jina' },
  { label: 'TEI (self-hosted)', value: 'tei' }
]

export function createSearchProfilesCollection(config: CreateSearchProfilesCollectionConfig): CollectionConfig {
  const collectionSlug = config.collectionSlug ?? 'search-profiles'
  const foldersCollectionSlug = config.foldersCollectionSlug ?? 'payload-folders'

  const fields: Field[] = [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'General',
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: { description: 'Display name visible to admins, e.g. "Libertarios — austriaca".' }
            },
            {
              name: 'slug',
              type: 'text',
              required: true,
              admin: {
                description:
                  'URL-friendly identifier referenced by callers (agents, MCP tokens). Must be unique within the tenant.'
              }
            },
            {
              name: 'description',
              type: 'textarea',
              admin: { description: 'Optional notes about the criterion this profile represents.' }
            }
          ]
        },
        {
          label: 'Filters',
          description: 'Hard filters applied AND-composed with any filters the caller passes per query.',
          fields: [
            {
              name: 'taxonomyFilters',
              type: 'relationship',
              relationTo: config.taxonomyCollectionSlug,
              hasMany: true,
              admin: {
                description: 'Only chunks whose document carries one of these taxonomies are searched.'
              }
            },
            {
              name: 'folderFilters',
              type: 'relationship',
              relationTo: foldersCollectionSlug,
              hasMany: true,
              admin: {
                description:
                  'Only chunks under one of these folders (or their descendants) are searched. Compounds with taxonomyFilters.'
              }
            }
          ]
        },
        {
          label: 'Retrieval params',
          fields: [
            {
              name: 'hybridAlpha',
              type: 'number',
              defaultValue: 0.5,
              min: 0,
              max: 1,
              admin: {
                description: 'Hybrid search weight. 0 = lexical only (BM25), 1 = vector only. 0.5 balances both.',
                step: 0.05
              }
            },
            {
              name: 'inputK',
              type: 'number',
              defaultValue: 50,
              min: 1,
              max: 200,
              admin: {
                description:
                  'How many candidates Typesense should return before the reranker runs. Larger = better recall, more reranker cost.'
              }
            },
            {
              name: 'topK',
              type: 'number',
              defaultValue: 10,
              min: 1,
              max: 100,
              admin: { description: 'Final number of chunks delivered to the caller after reranking.' }
            },
            {
              name: 'queryRewrite',
              type: 'textarea',
              admin: {
                description:
                  'Optional Mustache template applied to the query before embedding. Variables: {{query}}, {{tenant_name}}. Leave empty to embed the query verbatim.'
              }
            }
          ]
        },
        {
          label: 'Reranker',
          description:
            'Two-stage retrieval: Typesense returns inputK candidates, the reranker reorders to topK using a cross-encoder model.',
          fields: [
            {
              name: 'reranker',
              type: 'group',
              fields: [
                {
                  name: 'kind',
                  type: 'select',
                  options: rerankerKindOptions,
                  defaultValue: 'none' satisfies SearchProfileRerankerKind,
                  admin: {
                    description:
                      'Reranker provider. "None" disables reranking. DeepInfra requires the consumer to have DEEPINFRA_API_KEY configured.'
                  }
                },
                {
                  name: 'model',
                  type: 'text',
                  admin: {
                    description:
                      'Model identifier as expected by the provider, e.g. "BAAI/bge-reranker-v2-m3" or "jinaai/jina-reranker-v2-base-multilingual" for DeepInfra. Required unless kind=none.',
                    condition: (_data, siblingData) => Boolean(siblingData?.kind) && siblingData.kind !== 'none'
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]

  const base: CollectionConfig = {
    slug: collectionSlug,
    access: {
      read: () => true,
      create: ({ req: { user } }) => Boolean(user),
      update: ({ req: { user } }) => Boolean(user),
      delete: ({ req: { user } }) => Boolean(user)
    },
    admin: {
      useAsTitle: 'name',
      group: 'Chat',
      defaultColumns: ['name', 'slug', 'tenant', 'updatedAt']
    },
    fields
  }

  return config.collectionOverrides ? config.collectionOverrides(base) : base
}
