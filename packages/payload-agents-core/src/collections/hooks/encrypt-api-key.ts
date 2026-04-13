/**
 * Hooks for encrypting/decrypting the `apiKey` field on the Agents collection.
 *
 * - `beforeChange`: encrypts the API key before saving to the database.
 * - `afterRead`: decrypts only for internal requests or super-admin users;
 *   all other consumers receive `apiKey: undefined`.
 */

import type { CollectionAfterReadHook, CollectionBeforeChangeHook } from 'payload'
import { decrypt, encrypt, isEncrypted } from '../../lib/encryption'
import type { ResolvedPluginConfig } from '../../types'

export function createEncryptBeforeChangeHook(config: ResolvedPluginConfig): CollectionBeforeChangeHook {
  return async ({ data, originalDoc }) => {
    if (!config.encryptionKey) return data

    if (data.apiKey) {
      if (!isEncrypted(data.apiKey)) {
        data.apiKey = encrypt(data.apiKey, config.encryptionKey)
      }
    }

    return data
  }
}

export function createDecryptAfterReadHook(config: ResolvedPluginConfig): CollectionAfterReadHook {
  return async ({ doc, req }) => {
    if (!config.encryptionKey) return doc
    if (!doc.apiKey || !isEncrypted(doc.apiKey)) return doc

    const isLocalAPI = req.payloadAPI === 'local'
    const isRuntimeRequest =
      config.runtimeSecret !== '' && req.headers?.get?.('x-runtime-secret') === config.runtimeSecret
    const userRoles = req.user && 'role' in req.user ? (req.user as unknown as { role: string[] }).role : []
    const isSuperAdminUser = Array.isArray(userRoles) && userRoles.includes('superadmin')

    if (!isLocalAPI && !isRuntimeRequest && !isSuperAdminUser) {
      doc.apiKey = undefined
      return doc
    }

    try {
      doc.apiKey = decrypt(doc.apiKey, config.encryptionKey)
    } catch (error) {
      console.error('[Agents Security] Failed to decrypt API key:', error instanceof Error ? error.message : 'unknown')
      doc.apiKey = '[DECRYPTION_FAILED]'
    }

    return doc
  }
}
