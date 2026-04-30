import type { Access } from 'payload'

const ownerOnly: Access = ({ req }) => {
  if (!req.user) return false
  return { user: { equals: req.user.id } }
}

export const createAccess: Access = ({ req }) => Boolean(req.user)
export const readAccess = ownerOnly
export const updateAccess = ownerOnly
export const deleteAccess = ownerOnly
