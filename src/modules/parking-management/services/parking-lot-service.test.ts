import type { ParkingLotCreateInput } from '../types'
import { describe, expect, it } from 'vitest'
import {
  LEGACY_PARKING_LOT_STORAGE_KEY,
  PARKING_LOT_SCHEMA_VERSION,
  PARKING_LOT_STORAGE_KEY,
  LocalParkingLotService,
  validateParkingLotCreateInput,
} from './parking-lot-service'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function input(overrides: Partial<ParkingLotCreateInput> = {}): ParkingLotCreateInput {
  return {
    code: 'P-001',
    name: '中心停车场',
    locationDescription: '体育中心东侧',
    point: null,
    navigationAddress: '株洲市天元区',
    totalSpaces: 120,
    feeType: 'free',
    hourlyRateYuan: null,
    openStatus: 'open',
    enabled: true,
    recommendationWeight: 50,
    sortOrder: 1,
    remark: '',
    ...overrides,
  }
}

describe('LocalParkingLotService', () => {
  it('persists CRUD records, keeps codes immutable and sorts by configured order', async () => {
    const storage = new MemoryStorage()
    const timestamps = [
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-02T00:00:00.000Z'),
      new Date('2026-01-03T00:00:00.000Z'),
      new Date('2026-01-04T00:00:00.000Z'),
    ]
    let timeIndex = 0
    let idIndex = 0
    const service = new LocalParkingLotService({
      storage,
      createId: () => `parking-${++idIndex}`,
      now: () => timestamps[timeIndex++]!,
    })

    const first = await service.create(input({ code: ' p-001 ', name: ' 一号停车场 ', sortOrder: 2 }))
    const second = await service.create(input({ code: 'P-002', name: '二号停车场', sortOrder: 1 }))
    expect(first).toMatchObject({ code: 'P-001', name: '一号停车场', availableSpaces: 120 })
    expect((await service.list()).map((record) => record.id)).toEqual([second.id, first.id])

    const updated = await service.update(first.id, {
      ...input({ code: 'IGNORED', name: '一号停车场已更新', totalSpaces: 150 }),
    })
    expect(updated).toMatchObject({ code: 'P-001', name: '一号停车场已更新', availableSpaces: 120 })
    expect(updated.createdAt).toBe(first.createdAt)

    const availability = await service.updateAvailability(first.id, 0)
    expect(availability).toMatchObject({ availableSpaces: 0, availabilityUpdatedAt: timestamps[3]!.toISOString() })

    await service.remove(second.id)
    expect((await service.list()).map((record) => record.id)).toEqual([first.id])
    const envelope = JSON.parse(storage.getItem(PARKING_LOT_STORAGE_KEY) ?? '{}') as { schemaVersion?: number }
    expect(envelope.schemaVersion).toBe(PARKING_LOT_SCHEMA_VERSION)
  })

  it('validates code, fields, coordinates, pricing and numeric ranges', async () => {
    const service = new LocalParkingLotService({ storage: new MemoryStorage(), createId: () => 'parking-1' })
    await service.create(input())
    await expect(service.create(input({ code: 'p-001' }))).rejects.toMatchObject({ code: 'duplicate_code' })
    await expect(service.create(input({ code: 'x', name: '新停车场' }))).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(service.create(input({ code: 'P-002', name: '一' }))).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(service.create(input({ code: 'P-002', totalSpaces: 0 }))).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(service.create(input({ code: 'P-002', point: { lng: 181, lat: 27 } }))).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(service.create(input({ code: 'P-002', feeType: 'paid', hourlyRateYuan: null }))).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(service.create(input({ code: 'P-002', feeType: 'paid', hourlyRateYuan: 5.555 }))).rejects.toMatchObject({ code: 'invalid_input' })
    expect(validateParkingLotCreateInput(input({ feeType: 'paid', hourlyRateYuan: 5.5 })).valid).toBe(true)
  })

  it('requires explicit confirmation before clamping availability to a smaller capacity', async () => {
    const timestamps = [new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-02T00:00:00.000Z')]
    let index = 0
    const service = new LocalParkingLotService({ storage: new MemoryStorage(), now: () => timestamps[index++]! })
    const created = await service.create(input({ totalSpaces: 120 }))
    const smaller = { ...input({ totalSpaces: 80 }) }
    await expect(service.update(created.id, smaller)).rejects.toMatchObject({ code: 'available_exceeds_total' })
    const updated = await service.update(created.id, smaller, { clampAvailableSpaces: true })
    expect(updated).toMatchObject({ totalSpaces: 80, availableSpaces: 80, availabilityUpdatedAt: timestamps[1]!.toISOString() })
    await expect(service.updateAvailability(created.id, 81)).rejects.toMatchObject({ code: 'invalid_available_spaces' })
  })

  it('migrates v1 records once while preserving IDs, timestamps and the old key', async () => {
    const storage = new MemoryStorage()
    const legacy = {
      schemaVersion: 1,
      records: [{
        id: 'legacy-1',
        name: '旧停车场',
        code: 'old-1',
        address: '旧地址',
        totalSpaces: 0,
        enabled: false,
        remark: '旧备注',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      }],
    }
    storage.setItem(LEGACY_PARKING_LOT_STORAGE_KEY, JSON.stringify(legacy))
    const [record] = await new LocalParkingLotService({ storage }).list()
    expect(record).toMatchObject({
      id: 'legacy-1',
      code: 'OLD-1',
      navigationAddress: '旧地址',
      totalSpaces: 1,
      availableSpaces: 1,
      point: null,
      feeType: 'free',
      sortOrder: 1,
      createdAt: legacy.records[0]!.createdAt,
      updatedAt: legacy.records[0]!.updatedAt,
    })
    expect(storage.getItem(LEGACY_PARKING_LOT_STORAGE_KEY)).toBe(JSON.stringify(legacy))
    expect(storage.getItem(PARKING_LOT_STORAGE_KEY)).not.toBeNull()
  })

  it('reports corrupted current or legacy data and missing records', async () => {
    const current = new MemoryStorage()
    current.setItem(PARKING_LOT_STORAGE_KEY, '{invalid')
    await expect(new LocalParkingLotService({ storage: current }).list()).rejects.toMatchObject({ code: 'storage_corrupted' })

    const legacy = new MemoryStorage()
    legacy.setItem(LEGACY_PARKING_LOT_STORAGE_KEY, '{invalid')
    await expect(new LocalParkingLotService({ storage: legacy }).list()).rejects.toMatchObject({ code: 'storage_corrupted' })

    const empty = new LocalParkingLotService({ storage: new MemoryStorage() })
    await expect(empty.update('missing', input())).rejects.toMatchObject({ code: 'not_found' })
    await expect(empty.updateAvailability('missing', 1)).rejects.toMatchObject({ code: 'not_found' })
    await expect(empty.remove('missing')).rejects.toMatchObject({ code: 'not_found' })
  })
})
