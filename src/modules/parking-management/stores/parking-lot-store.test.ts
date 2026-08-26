import type {
  ParkingLot,
  ParkingLotCreateInput,
  ParkingLotService,
  ParkingLotUpdateInput,
  ParkingLotUpdateOptions,
} from '../types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createParkingLotStore } from './parking-lot-store'

function lot(id: string, overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id,
    code: id.toUpperCase(),
    name: `停车场 ${id}`,
    locationDescription: '',
    point: null,
    navigationAddress: '',
    totalSpaces: 100,
    availableSpaces: 100,
    availabilityUpdateMethod: 'manual',
    feeType: 'free',
    feeStandard: '',
    openStatus: 'open',
    enabled: true,
    recommendationWeight: 50,
    sortOrder: 1,
    remark: '',
    coordinateSystem: 'GCJ-02',
    availabilityUpdatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

class StubParkingLotService implements ParkingLotService {
  records: ParkingLot[] = []
  failList = false
  failSave = false
  failDelete = false

  async list(): Promise<ParkingLot[]> {
    if (this.failList) throw new Error('加载失败')
    return structuredClone(this.records)
  }

  async create(input: ParkingLotCreateInput): Promise<ParkingLot> {
    if (this.failSave) throw new Error('保存失败')
    const created = lot('created', { ...input, availableSpaces: input.totalSpaces })
    this.records.push(created)
    return structuredClone(created)
  }

  async update(id: string, input: ParkingLotUpdateInput, options?: ParkingLotUpdateOptions): Promise<ParkingLot> {
    if (this.failSave) throw new Error('保存失败')
    const index = this.records.findIndex((record) => record.id === id)
    if (index < 0) throw new Error('不存在')
    const previous = this.records[index]!
    if (input.totalSpaces < previous.availableSpaces && !options?.clampAvailableSpaces) throw new Error('需要确认')
    const updated = {
      ...previous,
      ...input,
      availableSpaces: Math.min(previous.availableSpaces, input.totalSpaces),
    }
    this.records[index] = updated
    return structuredClone(updated)
  }

  async updateAvailability(id: string, availableSpaces: number): Promise<ParkingLot> {
    if (this.failSave) throw new Error('更新失败')
    const index = this.records.findIndex((record) => record.id === id)
    if (index < 0) throw new Error('不存在')
    this.records[index] = { ...this.records[index]!, availableSpaces }
    return structuredClone(this.records[index]!)
  }

  async remove(id: string): Promise<void> {
    if (this.failDelete) throw new Error('删除失败')
    this.records = this.records.filter((record) => record.id !== id)
  }
}

function input(overrides: Partial<ParkingLotCreateInput> = {}): ParkingLotCreateInput {
  return {
    code: 'NEW-001',
    name: '新停车场',
    locationDescription: '',
    point: { lng: 113.1462, lat: 27.8165 },
    navigationAddress: '',
    totalSpaces: 100,
    availabilityUpdateMethod: 'manual',
    feeType: 'free',
    feeStandard: '',
    openStatus: 'open',
    enabled: true,
    recommendationWeight: 50,
    sortOrder: 1,
    remark: '',
    ...overrides,
  }
}

function updateInput(overrides: Partial<ParkingLotUpdateInput> = {}): ParkingLotUpdateInput {
  const value = input(overrides)
  return {
    name: value.name,
    locationDescription: value.locationDescription,
    point: value.point,
    navigationAddress: value.navigationAddress,
    totalSpaces: value.totalSpaces,
    availabilityUpdateMethod: value.availabilityUpdateMethod,
    feeType: value.feeType,
    feeStandard: value.feeStandard,
    openStatus: value.openStatus,
    enabled: value.enabled,
    recommendationWeight: value.recommendationWeight,
    sortOrder: value.sortOrder,
    remark: value.remark,
  }
}

describe('parking lot store', () => {
  let service: StubParkingLotService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubParkingLotService()
  })

  it('combines keyword and status filters and keeps map results independent of pagination', async () => {
    service.records = [
      lot('A-001', { name: '东区停车场', feeType: 'paid', feeStandard: '5 元/小时', availabilityUpdateMethod: 'integrated', sortOrder: 1 }),
      lot('B-001', { name: '西区停车场', openStatus: 'closed', enabled: false, sortOrder: 2 }),
      lot('A-002', { name: '东区备用停车场', sortOrder: 3 }),
    ]
    const store = createParkingLotStore(service, 'parking-filter')()
    await store.load()
    store.setQuery({ keyword: '东区', feeType: 'paid', openStatus: 'open', availabilityUpdateMethod: 'integrated' })
    expect(store.filteredRecords.map((record) => record.id)).toEqual(['A-001'])
    store.resetQuery()
    expect(store.filteredRecords).toHaveLength(3)
    expect(store.pageSize).toBe(20)
  })

  it('paginates at 20 records and sorts by sort order', async () => {
    service.records = Array.from({ length: 21 }, (_, index) => lot(`P-${index + 1}`, { sortOrder: 21 - index }))
    const store = createParkingLotStore(service, 'parking-pagination')()
    await store.load()
    expect(store.paginatedRecords).toHaveLength(20)
    expect(store.filteredRecords).toHaveLength(21)
    expect(store.paginatedRecords[0]?.sortOrder).toBe(1)
    store.setPage(2)
    expect(store.paginatedRecords).toHaveLength(1)
  })

  it('validates unique codes for create and base fields for update', async () => {
    service.records = [lot('A-001')]
    const store = createParkingLotStore(service, 'parking-validation')()
    await store.load()
    expect(store.validateCreate(input({ code: 'a-001' })).issues).toContainEqual(
      expect.objectContaining({ field: 'code', code: 'duplicate' }),
    )
    expect(store.validateUpdate(updateInput({ name: ' ' })).valid).toBe(false)
  })

  it('creates, updates, updates availability and deletes without a refresh', async () => {
    service.records = [lot('A-001')]
    const store = createParkingLotStore(service, 'parking-crud')()
    await store.load()
    expect((await store.create(input()))?.id).toBe('created')
    expect((await store.update('A-001', updateInput({ name: '更新后' })))?.name).toBe('更新后')
    expect((await store.updateAvailability('A-001', 12))?.availableSpaces).toBe(12)
    expect(store.updatingAvailabilityId).toBeNull()
    await expect(store.remove('created')).resolves.toBe(true)
    expect(store.records.some((record) => record.id === 'created')).toBe(false)
  })

  it('retains records and exposes errors when operations fail', async () => {
    const store = createParkingLotStore(service, 'parking-failure')()
    service.failList = true
    await expect(store.load()).resolves.toBe(false)
    expect(store.error).toBe('加载失败')

    service.failList = false
    service.records = [lot('A-001')]
    await store.load()
    service.failSave = true
    await expect(store.create(input())).resolves.toBeNull()
    expect(store.records).toHaveLength(1)
    await expect(store.updateAvailability('A-001', 10)).resolves.toBeNull()

    service.failSave = false
    service.failDelete = true
    await expect(store.remove('A-001')).resolves.toBe(false)
    expect(store.records).toHaveLength(1)
  })
})
