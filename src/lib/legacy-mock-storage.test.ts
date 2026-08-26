import { describe, expect, it } from 'vitest'
import { clearLegacyMockStorage, LEGACY_MOCK_STORAGE_KEYS } from './legacy-mock-storage'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('legacy mock storage cleanup', () => {
  it('removes obsolete module mocks without touching auth or the shared gate binding cache', () => {
    const storage = new MemoryStorage()
    for (const key of LEGACY_MOCK_STORAGE_KEYS) storage.setItem(key, 'mock')
    storage.setItem('zz-sports-auth-session:v1', 'session')
    storage.setItem('zz-sports-seat-zone-gate-bindings:v1', 'shared-gate-bindings')

    clearLegacyMockStorage(storage)

    for (const key of LEGACY_MOCK_STORAGE_KEYS) expect(storage.getItem(key)).toBeNull()
    expect(storage.getItem('zz-sports-auth-session:v1')).toBe('session')
    expect(storage.getItem('zz-sports-seat-zone-gate-bindings:v1')).toBe('shared-gate-bindings')
  })
})
