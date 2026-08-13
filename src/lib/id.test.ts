import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClientId } from './id'

describe('createClientId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses randomUUID when the browser provides it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'secure-id' })
    expect(createClientId()).toBe('secure-id')
  })

  it('falls back when a LAN HTTP context has no randomUUID', () => {
    vi.stubGlobal('crypto', {})
    const id = createClientId()
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/)
  })

  it('keeps fallback IDs unique within the same millisecond', () => {
    vi.stubGlobal('crypto', {})
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(createClientId()).not.toBe(createClientId())
  })
})
