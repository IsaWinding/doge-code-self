import { describe, expect, test } from 'bun:test'
import { createLazyPromise } from './prompts.js'

describe('createLazyPromise', () => {
  test('does not compute until first use', async () => {
    let calls = 0
    const lazyValue = createLazyPromise(async () => {
      calls++
      return 'ready'
    })

    expect(calls).toBe(0)
    await expect(lazyValue()).resolves.toBe('ready')
    expect(calls).toBe(1)
  })

  test('reuses the same in-flight promise across repeated calls', async () => {
    let calls = 0
    const lazyValue = createLazyPromise(async () => {
      calls++
      await Bun.sleep(5)
      return { ok: true }
    })

    const [first, second, third] = await Promise.all([
      lazyValue(),
      lazyValue(),
      lazyValue(),
    ])

    expect(first).toEqual({ ok: true })
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(calls).toBe(1)
  })
})
