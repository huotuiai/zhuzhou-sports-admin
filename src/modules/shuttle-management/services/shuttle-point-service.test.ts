import { describe, expect, it } from 'vitest'
import type { ShuttlePointWriteInput } from '../types'
import { LocalShuttlePointService, validateShuttlePointInput } from './shuttle-point-service'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function input(overrides: Partial<ShuttlePointWriteInput> = {}): ShuttlePointWriteInput {
  return {
    name: '东广场接驳点', code: 'SHUTTLE-E01', address: '东广场', contactName: '张三', contactPhone: '13800000000',
    routeName: '体育中心—神农城广场线', stations: [{ id: 's1', name: '体育中心' }, { id: 's2', name: '神农城广场' }],
    vehicles: [{ id: 'v1', name: '1 号接驳车', plateNumber: '湘B12345', capacity: 45 }],
    firstDeparture: '08:00', lastDeparture: '22:00', departureInterval: 15, enabled: true, remark: '', ...overrides,
  }
}

describe('LocalShuttlePointService', () => {
  it('persists nested route and vehicle configuration', async () => {
    const storage = new MemoryStorage()
    const service = new LocalShuttlePointService({ storage, createId: () => 'shuttle-1', now: () => new Date('2026-08-13T00:00:00.000Z') })
    const created = await service.create(input())
    expect(created.stations).toHaveLength(2)
    expect(created.vehicles[0]?.plateNumber).toBe('湘B12345')
    created.stations[0]!.name = '外部更改'
    expect((await service.list())[0]?.stations[0]?.name).toBe('体育中心')
    await expect(service.create(input({ code: 'shuttle-e01' }))).rejects.toThrow('编码不能重复')
  })

  it('validates ordered stations, schedule and vehicle details', () => {
    const result = validateShuttlePointInput(input({ stations: [{ id: 's1', name: '只有一站' }], lastDeparture: '07:00', departureInterval: 0 }))
    expect(result.issues.map((item) => item.field)).toEqual(['stations', 'lastDeparture', 'departureInterval'])
    expect(validateShuttlePointInput(input({ vehicles: [] })).valid).toBe(true)
  })
})
