/**
 * Regression tests for the eager host-config validation `agentPlugin` runs
 * on `incomingConfig`.
 *
 * Background: the plugin's agents collection has a `folders` relationship
 * field pointing at Payload's auto-injected folders collection. Payload only
 * injects that collection when (a) `buildConfig({ folders })` isn't `false`
 * and (b) at least one host collection has `folders: true`. If either gate
 * fails the boot blows up with a cryptic `InvalidFieldRelationship` from
 * deep inside Payload's sanitizer. We assert eagerly so the host gets an
 * actionable error instead — these tests pin that contract.
 */

import type { CollectionConfig, Config, Payload } from 'payload'
import { describe, expect, it } from 'vitest'
import { agentPlugin } from './plugin'
import type { AgentPluginConfig } from './types'

const mediaCollection: CollectionConfig = { slug: 'media', fields: [] }
const taxonomiesCollection: CollectionConfig = { slug: 'taxonomies', fields: [] }
const foldersEnabledCollection: CollectionConfig = {
  slug: 'posts',
  folders: true,
  fields: []
}

const baseUserConfig: AgentPluginConfig = {
  runtimeUrl: 'http://runtime.test',
  runtimeSecret: 'test-secret',
  getDailyLimit: async (_payload: Payload, _userId: string | number) => 1_000,
  mediaCollectionSlug: 'media',
  taxonomyCollectionSlug: 'taxonomies',
  searchCollectionOptions: [{ label: 'Posts', value: 'posts_chunk' }]
}

function makeIncomingConfig(overrides: Partial<Config> = {}): Config {
  return {
    folders: {},
    collections: [mediaCollection, taxonomiesCollection, foldersEnabledCollection],
    ...overrides
  } as Config
}

describe('agentPlugin — folders config validation', () => {
  it('throws when host disables folders globally (`folders: false`)', () => {
    const plugin = agentPlugin(baseUserConfig)
    expect(() => plugin(makeIncomingConfig({ folders: false }))).toThrow(
      /foldersCollectionSlug.*folders: false/
    )
  })

  it('throws when no collection has `folders: true` (auto-injection never fires)', () => {
    const plugin = agentPlugin(baseUserConfig)
    const noFolders: Config = makeIncomingConfig({
      collections: [mediaCollection, taxonomiesCollection, { slug: 'posts', fields: [] }]
    })
    expect(() => plugin(noFolders)).toThrow(/no host collection has `folders: true`/)
  })

  it('error message names the configured slug so custom overrides are easy to track', () => {
    const plugin = agentPlugin({
      ...baseUserConfig,
      foldersCollectionSlug: 'my-custom-folders'
    })
    expect(() => plugin(makeIncomingConfig({ folders: false }))).toThrow(
      /foldersCollectionSlug="my-custom-folders"/
    )
  })

  it('error guides the host to a concrete fix (folders: {} and/or collection opt-in)', () => {
    const plugin = agentPlugin(baseUserConfig)
    expect(() =>
      plugin(
        makeIncomingConfig({
          collections: [mediaCollection, taxonomiesCollection, { slug: 'posts', fields: [] }]
        })
      )
    ).toThrow(/enable folders on a content collection/)
  })
})
