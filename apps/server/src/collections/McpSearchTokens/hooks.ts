import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'

const MAX_TOKENS_PER_USER = 10

export const setUserBeforeChange: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  if (operation === 'create' && req.user) {
    return { ...data, user: req.user.id }
  }
  return data
}

export const enforceMaxTokens: CollectionBeforeValidateHook = async ({ data, req, operation }) => {
  if (operation !== 'create' || !req.user) return data
  const { totalDocs } = await req.payload.find({
    collection: 'mcp-search-tokens',
    where: { user: { equals: req.user.id } },
    limit: 0,
  })
  if (totalDocs >= MAX_TOKENS_PER_USER) {
    throw new Error(`Maximum ${MAX_TOKENS_PER_USER} tokens per user reached`)
  }
  return data
}
