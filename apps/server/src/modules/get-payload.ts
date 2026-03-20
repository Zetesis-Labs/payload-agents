import { getPayload as getPayloadFn } from 'payload'

export async function getPayload() {
  // Dynamic import to avoid circular dependency
  const configModule = await import('@payload-config')
  return getPayloadFn({ config: configModule.default })
}
