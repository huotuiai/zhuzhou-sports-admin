import { describe, expect, it } from 'vitest'
import type { TicketGateWriteInput } from '../types'
import { LocalTicketGateService, validateTicketGateInput } from './ticket-gate-service'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function input(overrides: Partial<TicketGateWriteInput> = {}): TicketGateWriteInput {
  return { name: '东广场检票口', code: 'GATE-E01', venueArea: '体育场东广场', location: '', direction: 'entry', laneCount: 4, deviceCount: 4, enabled: true, remark: '', ...overrides }
}

describe('LocalTicketGateService', () => {
  it('persists CRUD records and normalizes basic fields', async () => {
    const storage = new MemoryStorage()
    let id = 0
    const service = new LocalTicketGateService({ storage, createId: () => `gate-${++id}`, now: () => new Date('2026-08-13T00:00:00.000Z') })
    const created = await service.create(input({ name: ' 东广场检票口 ', code: ' GATE-E01 ' }))
    expect(created).toMatchObject({ name: '东广场检票口', code: 'GATE-E01' })
    await expect(service.create(input({ code: 'gate-e01' }))).rejects.toThrow('编码不能重复')
    const updated = await service.update(created.id, input({ code: 'GATE-E01', laneCount: 6 }))
    expect(updated.laneCount).toBe(6)
    await service.remove(created.id)
    expect(await service.list()).toEqual([])
  })

  it('validates required fields and device counts', () => {
    expect(validateTicketGateInput(input({ name: '', laneCount: 0, deviceCount: -1 })).issues.map((item) => item.field)).toEqual(['name', 'laneCount', 'deviceCount'])
  })
})
