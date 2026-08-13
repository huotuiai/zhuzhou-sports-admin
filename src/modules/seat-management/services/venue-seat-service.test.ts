import { describe, expect, it } from 'vitest'
import type { VenueSeatWriteInput } from '../types'
import { LocalVenueSeatService, validateVenueSeatInput } from './venue-seat-service'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function input(overrides: Partial<VenueSeatWriteInput> = {}): VenueSeatWriteInput {
  return { code: 'ST-A-01-008', venueArea: '主体育场', section: 'A 区', rowNumber: '01 排', seatNumber: '008 号', type: 'standard', status: 'available', remark: '', ...overrides }
}

describe('LocalVenueSeatService', () => {
  it('persists CRUD records and normalizes seat fields', async () => {
    const storage = new MemoryStorage()
    const timestamps = [new Date('2026-08-13T00:00:00.000Z'), new Date('2026-08-14T00:00:00.000Z')]
    let timeIndex = 0
    const service = new LocalVenueSeatService({ storage, createId: () => 'seat-1', now: () => timestamps[timeIndex++]! })
    const created = await service.create(input({ code: ' ST-A-01-008 ', section: ' A 区 ' }))
    expect(created).toMatchObject({ code: 'ST-A-01-008', section: 'A 区' })
    await expect(service.create(input({ code: 'st-a-01-008' }))).rejects.toThrow('编码不能重复')
    const updated = await service.update(created.id, input({ status: 'maintenance' }))
    expect(updated.status).toBe('maintenance')
    await service.remove(created.id)
    expect(await service.list()).toEqual([])
  })

  it('validates required location fields and remark length', () => {
    const result = validateVenueSeatInput(input({ venueArea: '', section: '', rowNumber: '', seatNumber: '', remark: '字'.repeat(301) }))
    expect(result.issues.map((item) => item.field)).toEqual(['venueArea', 'section', 'rowNumber', 'seatNumber', 'remark'])
  })
})
