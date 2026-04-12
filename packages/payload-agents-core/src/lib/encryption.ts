/**
 * AES-256-GCM encryption for API keys stored in the Agents collection.
 *
 * Format: `salt:iv:authTag:ciphertext` (all base64-encoded).
 * The key is derived from the consumer-provided encryption key via scrypt.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits for GCM
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 16
const KEY_LENGTH = 32 // 256 bits

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, KEY_LENGTH)
}

export function encrypt(plaintext: string, encryptionKey: string): string {
  if (!plaintext) return plaintext

  const salt = randomBytes(SALT_LENGTH)
  const key = deriveKey(encryptionKey, salt)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':')
}

export function decrypt(ciphertext: string, encryptionKey: string): string {
  if (!ciphertext) return ciphertext

  const parts = ciphertext.split(':')
  if (parts.length !== 4) {
    console.warn('[Encryption] Value does not appear to be encrypted, returning as-is')
    return ciphertext
  }

  const [saltB64, ivB64, authTagB64, encryptedB64] = parts
  if (!saltB64 || !ivB64 || !authTagB64 || !encryptedB64) {
    console.warn('[Encryption] Value does not appear to be encrypted, returning as-is')
    return ciphertext
  }

  try {
    const salt = Buffer.from(saltB64, 'base64')
    const iv = Buffer.from(ivB64, 'base64')
    const authTag = Buffer.from(authTagB64, 'base64')
    const encrypted = Buffer.from(encryptedB64, 'base64')

    const key = deriveKey(encryptionKey, salt)

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH
    })
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch (error) {
    console.error('[Encryption] Failed to decrypt value:', error)
    throw new Error('Failed to decrypt value. The encryption key may have changed.')
  }
}

export function isEncrypted(value: string): boolean {
  if (!value) return false
  const parts = value.split(':')
  return parts.length === 4
}
