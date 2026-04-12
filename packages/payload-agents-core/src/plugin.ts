/**
 * Plugin factory — `agentPlugin()`.
 *
 * Registers the Agents collection and all endpoints in a single call.
 */

import type { Config, Plugin } from 'payload'
import { createAgentsCollection } from './collections/agents'
import { createAgentsListHandler } from './endpoints/agents-list'
import { createChatHandler } from './endpoints/chat'
import { createSessionDeleteHandler, createSessionGetHandler, createSessionPatchHandler } from './endpoints/session'
import { createSessionsListHandler } from './endpoints/sessions'
import type { AgentPluginConfig, ResolvedPluginConfig } from './types'
import { defaultExtractTenantId } from './utils/extract-tenant'

function resolveConfig(userConfig: AgentPluginConfig): ResolvedPluginConfig {
  return {
    runtimeUrl: userConfig.runtimeUrl,
    runtimeSecret: userConfig.runtimeSecret ?? '',
    getDailyLimit: userConfig.getDailyLimit,
    extractTenantId: userConfig.extractTenantId ?? defaultExtractTenantId,
    collectionSlug: userConfig.collectionSlug ?? 'agents',
    basePath: userConfig.basePath ?? '/agents',
    encryptionKey: userConfig.encryptionKey,
    mediaCollectionSlug: userConfig.mediaCollectionSlug ?? 'media',
    taxonomyCollectionSlug: userConfig.taxonomyCollectionSlug ?? 'taxonomy'
  }
}

export function agentPlugin(userConfig: AgentPluginConfig): Plugin {
  return (incomingConfig: Config): Config => {
    const config = resolveConfig(userConfig)
    const basePath = config.basePath

    // Create the agents collection
    const agentsCollection = createAgentsCollection(config)

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
      }
    ]

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), agentsCollection],
      endpoints: [...(incomingConfig.endpoints ?? []), ...endpoints]
    }
  }
}
