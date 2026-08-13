import { describe, expect, it } from 'vitest'
import type { ParkingLotWriteInput } from '../types'
import {
  PARKING_LOT_STORAGE_KEY,
  LocalParkingLotService,
  validateParkingLotInput,
} from './parking-lot-service'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function input(overrides: Partial<ParkingLotWriteInput> = {}): ParkingLotWriteInput {
  return {
    name: '中心停车场',
    code: 'P-001',
    address: '株洲市天元区',
    totalSpaces: 120,
    enabled: true,
    remark: '',
    ...overrides,
  }
}

describe('LocalParkingLotService', () => {
  it('persists CRUD records and lists them by updated time descending', async () => {
    const storage = new MemoryStorage()
    const timestamps = [
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-02T00:00:00.000Z'),
      new Date('2026-01-03T00:00:00.000Z'),
    ]
    let timeIndex = 0
    let idIndex = 0
    const service = new LocalParkingLotService({
      storage,
      createId: () => `parking-${++idIndex}`,
      now: () => timestamps[timeIndex++]!,
    })

    const first = await service.create(input({ name: ' 一号停车场 ', code: ' P-001 ' }))
    const second = await service.create(input({ name: '二号停车场', code: 'P-002' }))
    expect(first).toMatchObject({ name: '一号停车场', code: 'P-001' })
    expect((await service.list()).map((record) => record.id)).toEqual([second.id, first.id])

    const restoredService = new LocalParkingLotService({ storage })
    expect((await restoredService.list()).map((record) => record.id)).toEqual([second.id, first.id])

    const updated = await service.update(first.id, input({ name: '一号停车场', code: 'P-001', enabled: false }))
    expect(updated.createdAt).toBe(first.createdAt)
    expect(updated.enabled).toBe(false)
    expect((await service.list())[0]?.id).toBe(first.id)

    await service.remove(second.id)
    expect((await service.list()).map((record) => record.id)).toEqual([first.id])
    const envelope = JSON.parse(storage.getItem(PARKING_LOT_STORAGE_KEY) ?? '{}') as {
      schemaVersion?: number
    }
    expect(envelope.schemaVersion).toBe(1)
  })

  it('enforces required fields, code uniqueness, capacity, and remark length', async () => {
    const service = new LocalParkingLotService({
      storage: new MemoryStorage(),
      createId: () => 'parking-1',
    })
    const created = await service.create(input())

    await expect(service.create(input({ code: 'p-001' }))).rejects.toMatchObject({
      code: 'duplicate_code',
    })
    await expect(service.update(created.id, input({ code: ' p-001 ' }))).resolves.toMatchObject({
      id: created.id,
      code: 'p-001',
    })
    await expect(service.create(input({ name: '', code: 'P-002' }))).rejects.toMatchObject({
      code: 'invalid_name',
    })
    await expect(service.create(input({ code: '', name: '新停车场' }))).rejects.toMatchObject({
      code: 'invalid_code',
    })
    await expect(service.create(input({ code: 'P-002', totalSpaces: -1 }))).rejects.toMatchObject({
      code: 'invalid_total_spaces',
    })
    await expect(service.create(input({ code: 'P-002', totalSpaces: Number.NaN }))).rejects.toMatchObject({
      code: 'invalid_total_spaces',
    })
    await expect(service.create(input({ code: 'P-002', totalSpaces: 2.5 }))).rejects.toMatchObject({
      code: 'invalid_total_spaces',
    })
    await expect(service.create(input({ code: 'P-002', remark: '字'.repeat(301) }))).rejects.toMatchObject({
      code: 'remark_too_long',
    })
  })

  it('accepts zero total spaces as a non-negative integer', () => {
    expect(validateParkingLotInput(input({ totalSpaces: 0 }))).toEqual({ valid: true, issues: [] })
  })

  it('reports corrupted stored data and missing records', async () => {
    const storage = new MemoryStorage()
    storage.setItem(PARKING_LOT_STORAGE_KEY, '{invalid')
    const service = new LocalParkingLotService({ storage })
    await expect(service.list()).rejects.toMatchObject({ code: 'storage_corrupted' })

    storage.clear()
    await expect(service.update('missing', input())).rejects.toMatchObject({ code: 'not_found' })
    await expect(service.remove('missing')).rejects.toMatchObject({ code: 'not_found' })
  })
})
