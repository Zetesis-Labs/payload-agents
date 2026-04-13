/**
 * Agents collection definition.
 *
 * Registers the `agents` collection (or custom slug) with fields for
 * LLM config, RAG config, and UI config. Hooks are injected by the plugin
 * based on the resolved config.
 */

import type { CollectionConfig } from 'payload'
import type { ResolvedPluginConfig } from '../types'
import { createDecryptAfterReadHook, createEncryptBeforeChangeHook } from './hooks/encrypt-api-key'
import { createAfterChangeHook, createAfterDeleteHook } from './hooks/reload-runtime'

export function createAgentsCollection(config: ResolvedPluginConfig): CollectionConfig {
  const { access: accessOverride, admin: adminOverride, labels: labelsOverride } = config.collectionOverrides

  return {
    slug: config.collectionSlug,
    ...(labelsOverride ? { labels: labelsOverride } : {}),
    access: {
      read: () => true,
      create: ({ req: { user } }) => Boolean(user),
      update: ({ req: { user } }) => Boolean(user),
      delete: ({ req: { user } }) => Boolean(user),
      ...accessOverride
    },
    hooks: {
      beforeChange: [createEncryptBeforeChangeHook(config)],
      afterChange: [createAfterChangeHook(config)],
      afterRead: [createDecryptAfterReadHook(config)],
      afterDelete: [createAfterDeleteHook(config)]
    },
    admin: {
      useAsTitle: 'name',
      group: 'Chat',
      defaultColumns: ['name', 'slug', 'llmModel', 'isActive'],
      ...adminOverride
    },
    fields: [
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
                admin: { description: 'Display name for the agent' }
              },
              {
                name: 'slug',
                type: 'text',
                required: true,
                unique: true,
                admin: { description: 'URL-friendly identifier' }
              },
              {
                name: 'isActive',
                type: 'checkbox',
                defaultValue: true,
                admin: { description: 'Enable or disable this agent' }
              }
            ]
          },
          {
            label: 'LLM Configuration',
            fields: [
              {
                name: 'llmModel',
                type: 'text',
                required: true,
                defaultValue: 'openai/gpt-4o',
                admin: {
                  description: 'LLM model to use (e.g., openai/gpt-4o, anthropic/claude-sonnet-4-20250514)'
                }
              },
              {
                name: 'apiKey',
                type: 'text',
                required: true,
                admin: {
                  description: config.encryptionKey
                    ? 'API Key for the LLM provider (encrypted at rest)'
                    : 'API Key for the LLM provider'
                }
              },
              {
                name: 'systemPrompt',
                type: 'textarea',
                required: true,
                admin: { description: 'System prompt that defines the agent personality and constraints' }
              },
              {
                name: 'toolCallLimit',
                type: 'number',
                admin: { description: 'Max tool calls per turn. Leave empty for no limit.' }
              }
            ]
          },
          {
            label: 'RAG Configuration',
            fields: [
              {
                type: 'row',
                fields: [
                  {
                    name: 'searchCollections',
                    type: 'select',
                    hasMany: true,
                    defaultValue: ['posts_chunk', 'books_chunk'],
                    options: [
                      { label: 'Posts', value: 'posts_chunk' },
                      { label: 'Books', value: 'books_chunk' }
                    ],
                    admin: { description: 'Collections to search for RAG context' }
                  },
                  {
                    name: 'taxonomies',
                    type: 'relationship',
                    relationTo: config.taxonomyCollectionSlug,
                    hasMany: true,
                    admin: {
                      description:
                        'Taxonomies that filter the RAG content. REQUIRED: if empty, agent will not search any content.'
                    }
                  }
                ]
              },
              {
                name: 'kResults',
                type: 'number',
                defaultValue: 5,
                admin: { description: 'Number of chunks to retrieve for RAG context' }
              },
              {
                name: 'maxContextBytes',
                type: 'number',
                defaultValue: 65536,
                admin: { description: 'Maximum context size in bytes (default: 64KB)' }
              },
              {
                name: 'ttl',
                type: 'number',
                defaultValue: 86400,
                admin: { description: 'TTL for conversation history in seconds (default: 24h)' }
              }
            ]
          },
          {
            label: 'UI Configuration',
            fields: [
              {
                name: 'avatar',
                type: 'upload',
                relationTo: config.mediaCollectionSlug,
                admin: { description: 'Avatar image for the agent' }
              },
              {
                name: 'welcomeTitle',
                type: 'text',
                admin: { description: 'Welcome message title displayed when starting a new chat' }
              },
              {
                name: 'welcomeSubtitle',
                type: 'text',
                admin: { description: 'Welcome message subtitle displayed when starting a new chat' }
              },
              {
                name: 'suggestedQuestions',
                type: 'array',
                admin: { description: 'Suggested questions to help users get started' },
                fields: [
                  {
                    name: 'prompt',
                    type: 'text',
                    required: true,
                    admin: { description: 'The full prompt text to send when clicked' }
                  },
                  {
                    name: 'title',
                    type: 'text',
                    required: true,
                    admin: { description: 'Short title for the suggestion' }
                  },
                  {
                    name: 'description',
                    type: 'text',
                    admin: { description: 'Brief description of what the question is about' }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
