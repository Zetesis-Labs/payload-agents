/**
 * Plugin factory — `agentPlugin()`.
 *
 * Registers the Agents collection and all endpoints in a single call.
 */

import type { Config, Plugin } from 'payload'
import { createAgentsCollection } from './collections/agents'
import { createAgentsInternalListHandler } from './endpoints/agents-internal-list'
import { createAgentsListHandler } from './endpoints/agents-list'
import { createChatHandler } from './endpoints/chat'
import { createSessionDeleteHandler, createSessionGetHandler, createSessionPatchHandler } from './endpoints/session'
import { createSessionsListHandler } from './endpoints/sessions'
import { createUsageHandler } from './endpoints/usage'
import { defaultBuildSessionId, defaultValidateSessionOwnership } from './lib/session-id'
import type { AgentPluginConfig, ResolvedPluginConfig } from './types'

function resolveConfig(userConfig: AgentPluginConfig): ResolvedPluginConfig {
  const runtimeSecret = userConfig.runtimeSecret ?? ''
  if (!runtimeSecret) {
    console.warn('[agent-plugin] runtimeSecret is empty — all runtime requests will be unauthenticated')
  }
  if (userConfig.searchCollectionOptions.length === 0) {
    throw new Error(
      '[agent-plugin] searchCollectionOptions cannot be empty — pass at least one chunked collection your agents are allowed to query'
    )
  }
  return {
    runtimeUrl: userConfig.runtimeUrl,
    runtimeSecret,
    getDailyLimit: userConfig.getDailyLimit,
    buildSessionId: userConfig.buildSessionId ?? defaultBuildSessionId,
    validateSessionOwnership: userConfig.validateSessionOwnership ?? defaultValidateSessionOwnership,
    getRuntimeHeaders: userConfig.getRuntimeHeaders,
    collectionSlug: userConfig.collectionSlug ?? 'agents',
    basePath: userConfig.basePath ?? '/agents',
    encryptionKey: userConfig.encryptionKey,
    mediaCollectionSlug: userConfig.mediaCollectionSlug,
    taxonomyCollectionSlug: userConfig.taxonomyCollectionSlug,
    foldersCollectionSlug: userConfig.foldersCollectionSlug ?? 'payload-folders',
    searchCollectionOptions: userConfig.searchCollectionOptions,
    collectionOverrides: userConfig.collectionOverrides,
    onRunCompleted: userConfig.onRunCompleted
  }
}

function assertCollectionExists(config: Config, slug: string, configField: string): void {
  const exists = (config.collections ?? []).some(c => c.slug === slug)
  if (!exists) {
    throw new Error(
      `[agent-plugin] collection "${slug}" referenced by ${configField} is not registered in payload config`
    )
  }
}

/**
 * Payload auto-injects the folders collection (default slug `payload-folders`)
 * only when (1) `buildConfig({ folders: ... })` isn't disabled AND (2) at
 * least one collection has `folders: true`. Without both, the agents
 * collection's `folders` relationship field references a phantom collection
 * and Payload's sanitizer throws a cryptic `InvalidFieldRelationship`.
 *
 * Validate eagerly so the host gets an actionable error from us instead.
 */
function assertFoldersWillBeInjected(config: Config, slug: string): void {
  if (config.folders === false) {
    throw new Error(
      `[agent-plugin] foldersCollectionSlug="${slug}" but \`buildConfig({ folders: false })\` ` +
        "disables Payload's auto-injected folders collection. " +
        'Set `folders: {}` (or any RootFoldersConfiguration) in your payload.config.ts.'
    )
  }
  const hasFolderEnabled = (config.collections ?? []).some(c => c.folders === true)
  if (!hasFolderEnabled) {
    throw new Error(
      `[agent-plugin] foldersCollectionSlug="${slug}" but no host collection has \`folders: true\`. ` +
        'Payload only auto-injects the folders collection when at least one collection opts in — ' +
        'enable folders on a content collection (e.g. Posts) in your payload.config.ts.'
    )
  }
}

export function agentPlugin(userConfig: AgentPluginConfig): Plugin {
  return (incomingConfig: Config): Config => {
    const config = resolveConfig(userConfig)
    const basePath = config.basePath

    assertCollectionExists(incomingConfig, config.mediaCollectionSlug, 'mediaCollectionSlug')
    assertCollectionExists(incomingConfig, config.taxonomyCollectionSlug, 'taxonomyCollectionSlug')
    assertFoldersWillBeInjected(incomingConfig, config.foldersCollectionSlug)

    // Create the agents collection + register the internal-list endpoint on
    // it (X-Internal-Secret + overrideAccess; replaces the old runtime-secret
    // bypass that lived in the host's collection access functions).
    const agentsCollection = createAgentsCollection(config)
    agentsCollection.endpoints = [
      ...(agentsCollection.endpoints ?? []),
      {
        path: '/internal/list',
        method: 'get' as const,
        handler: createAgentsInternalListHandler(config)
      }
    ]

    // Register endpoints on the collection
    const endpoints = [
      {
        path: basePath,
        method: 'post' as const,
        handler: createChatHandler(config)
      },
      {
        path: `${basePath}/session`,
        method: 'get' as const,
        handler: createSessionGetHandler(config)
      },
      {
        path: `${basePath}/session`,
        method: 'patch' as const,
        handler: createSessionPatchHandler(config)
      },
      {
        path: `${basePath}/session`,
        method: 'delete' as const,
        handler: createSessionDeleteHandler(config)
      },
      {
        path: `${basePath}/sessions`,
        method: 'get' as const,
        handler: createSessionsListHandler(config)
      },
      {
        path: `${basePath}/agents`,
        method: 'get' as const,
        handler: createAgentsListHandler(config)
      },
      {
        path: `${basePath}/usage`,
        method: 'get' as const,
        handler: createUsageHandler(config)
      }
    ]

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), agentsCollection],
      endpoints: [...(incomingConfig.endpoints ?? []), ...endpoints]
    }
  }
}
