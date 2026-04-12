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
        console.log('[Agents Security] Encrypting API key before save')
        data.apiKey = encrypt(data.apiKey, config.encryptionKey)
      } else if (originalDoc?.apiKey === data.apiKey) {
        console.log('[Agents Security] API key unchanged, keeping encrypted value')
      }
    }

    return data
  }
}

export function createDecryptAfterReadHook(config: ResolvedPluginConfig): CollectionAfterReadHook {
  return async ({ doc, req }) => {
    if (!config.encryptionKey) return doc
    if (!doc.apiKey || !isEncrypted(doc.apiKey)) return doc

    const isInternalRequest = req.headers?.get?.('x-internal-request') === 'true'
    const userRoles = req.user && 'role' in req.user ? (req.user as unknown as { role: string[] }).role : []
    const isSuperAdminUser = Array.isArray(userRoles) && userRoles.includes('superadmin')

    if (!isInternalRequest && !isSuperAdminUser) {
      doc.apiKey = undefined
      return doc
    }

    try {
      doc.apiKey = decrypt(doc.apiKey, config.encryptionKey)
    } catch (error) {
      console.error('[Agents Security] Failed to decrypt API key:', error)
      doc.apiKey = '[DECRYPTION_FAILED]'
    }

    return doc
  }
}
