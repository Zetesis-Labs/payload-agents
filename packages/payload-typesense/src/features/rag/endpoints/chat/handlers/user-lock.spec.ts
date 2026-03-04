import { describe, expect, it } from 'vitest'
import { withUserLock } from './user-lock'

describe('withUserLock', () => {
  it('serializes calls for the same userId', async () => {
    const order: number[] = []

    const createDelayedFn = (id: number, ms: number) => async () => {
      await new Promise(resolve => setTimeout(resolve, ms))
      order.push(id)
      return id
    }

    const p1 = withUserLock('user-1', createDelayedFn(1, 50))
    const p2 = withUserLock('user-1', createDelayedFn(2, 10))

    await Promise.all([p1, p2])

    // Even though fn2 is faster, fn1 should complete first because they're serialized
    expect(order).toEqual([1, 2])
  })

  it('allows parallel execution for different userIds', async () => {
    const order: string[] = []

    const p1 = withUserLock('user-1', async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      order.push('user-1')
    })

    const p2 = withUserLock('user-2', async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      order.push('user-2')
    })

    await Promise.all([p1, p2])

    // user-2 should finish first because they run in parallel
    expect(order).toEqual(['user-2', 'user-1'])
  })

  it('handles string and number userId', async () => {
    const order: number[] = []

    // String and number with same value should serialize
    const p1 = withUserLock(42, async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      order.push(1)
    })
    const p2 = withUserLock('42', async () => {
      order.push(2)
    })

    await Promise.all([p1, p2])

    expect(order).toEqual([1, 2])
  })

  it('propagates errors from fn', async () => {
    await expect(
      withUserLock('user-1', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
  })

  it('error in one operation does not break the next for the same user', async () => {
    const p1 = withUserLock('user-1', async () => {
      throw new Error('first failed')
    }).catch(() => 'caught')

    const p2 = withUserLock('user-1', async () => 'second ok')

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe('caught')
    expect(r2).toBe('second ok')
  })
})
