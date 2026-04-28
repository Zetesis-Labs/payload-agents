import type { TypedUser } from 'payload'
import { describe, expect, it } from 'vitest'
import { getUserId } from './user'

describe('getUserId', () => {
  it('returns a string id verbatim', () => {
    const user = { id: 'user-abc-123' } as unknown as TypedUser
    expect(getUserId(user)).toBe('user-abc-123')
  })

  it('returns a numeric id verbatim', () => {
    const user = { id: 42 } as unknown as TypedUser
    expect(getUserId(user)).toBe(42)
  })

  it('preserves zero as a valid numeric id', () => {
    // Edge: `0` is falsy but a valid Postgres int. Don't truthiness-check.
    const user = { id: 0 } as unknown as TypedUser
    expect(getUserId(user)).toBe(0)
  })

  it('throws when id is undefined', () => {
    const user = {} as unknown as TypedUser
    expect(() => getUserId(user)).toThrow(/has no valid id/)
  })

  it('throws when id is null', () => {
    const user = { id: null } as unknown as TypedUser
    expect(() => getUserId(user)).toThrow(/has no valid id/)
  })

  it('throws when id is an object (e.g. populated relation)', () => {
    const user = { id: { _id: 1 } } as unknown as TypedUser
    expect(() => getUserId(user)).toThrow(/has no valid id/)
  })

  it('throws when id is a boolean', () => {
    const user = { id: true } as unknown as TypedUser
    expect(() => getUserId(user)).toThrow(/has no valid id/)
  })
})
