import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ParkingLot, ParkingLotService, ParkingLotWriteInput } from '../types'
import { createParkingLotStore } from './parking-lot-store'

function lot(id: string, overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id,
    name: `停车场 ${id}`,
    code: id.toUpperCase(),
    address: '',
    totalSpaces: 10,
    enabled: true,
    remark: '',
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

  async create(input: ParkingLotWriteInput): Promise<ParkingLot> {
    if (this.failSave) throw new Error('保存失败')
    const created = lot('created', { ...input })
    this.records.unshift(created)
    return structuredClone(created)
  }

  async update(id: string, input: ParkingLotWriteInput): Promise<ParkingLot> {
    if (this.failSave) throw new Error('保存失败')
    const index = this.records.findIndex((record) => record.id === id)
    if (index < 0) throw new Error('不存在')
    const updated = { ...this.records[index]!, ...input }
    this.records[index] = updated
    return structuredClone(updated)
  }

  async remove(id: string): Promise<void> {
    if (this.failDelete) throw new Error('删除失败')
    this.records = this.records.filter((record) => record.id !== id)
  }
}

function input(overrides: Partial<ParkingLotWriteInput> = {}): ParkingLotWriteInput {
  return {
    name: '新停车场',
    code: 'NEW-001',
    address: '',
    totalSpaces: 0,
    enabled: true,
    remark: '',
    ...overrides,
  }
}

describe('parking lot store', () => {
  let service: StubParkingLotService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubParkingLotService()
  })

  it('filters by name, code, and status and paginates results', async () => {
    service.records = [
      lot('A-001', { name: '东区停车场' }),
      lot('B-001', { name: '西区停车场', enabled: false }),
      lot('A-002', { name: '东区备用停车场' }),
    ]
    const store = createParkingLotStore(service, 'parking-filter')()
    await store.load()

    store.setQuery({ name: '东区', code: 'a-', status: 'enabled' })
    expect(store.filteredRecords.map((record) => record.id)).toEqual(['A-001', 'A-002'])
    store.setPageSize(1)
    expect(store.pageCount).toBe(2)
    expect(store.paginatedRecords.map((record) => record.id)).toEqual(['A-001'])
    store.setPage(2)
    expect(store.paginatedRecords.map((record) => record.id)).toEqual(['A-002'])

    store.resetQuery()
    expect(store.page).toBe(1)
    expect(store.total).toBe(3)
  })

  it('validates duplicate code while excluding the edited record', async () => {
    service.records = [lot('A-001')]
    const store = createParkingLotStore(service, 'parking-validation')()
    await store.load()
    expect(store.validate(input({ code: 'a-001' })).issues).toContainEqual(
      expect.objectContaining({ field: 'code', code: 'duplicate' }),
    )
    expect(store.validate(input({ code: 'a-001' }), 'A-001').valid).toBe(true)
  })

  it('creates, updates, and deletes while exposing operation state', async () => {
    service.records = [lot('A-001')]
    const store = createParkingLotStore(service, 'parking-crud')()
    await store.load()
    const created = await store.create(input())
    expect(created?.id).toBe('created')
    expect(store.isSaving).toBe(false)

    const updated = await store.update('A-001', input({ code: 'A-001', name: '更新后' }))
    expect(updated?.name).toBe('更新后')

    await expect(store.remove('created')).resolves.toBe(true)
    expect(store.deletingId).toBeNull()
    expect(store.records.some((record) => record.id === 'created')).toBe(false)
  })

  it('keeps a successful write even when a later list refresh would fail', async () => {
    service.records = [lot('A-001')]
    const store = createParkingLotStore(service, 'parking-write-without-refresh')()
    await store.load()
    service.failList = true

    const created = await store.create(input())
    expect(created?.id).toBe('created')
    expect(store.records.some((record) => record.id === 'created')).toBe(true)

    const updated = await store.update('A-001', input({ code: 'A-001', name: '已更新' }))
    expect(updated?.name).toBe('已更新')
    expect(store.records.find((record) => record.id === 'A-001')?.name).toBe('已更新')
  })

  it('records loading, saving, and deleting failures without mutating data', async () => {
    const store = createParkingLotStore(service, 'parking-failure')()
    service.failList = true
    await expect(store.load()).resolves.toBe(false)
    expect(store.error).toBe('加载失败')
    expect(store.isLoading).toBe(false)

    service.failList = false
    service.records = [lot('A-001')]
    await store.load()
    service.failSave = true
    await expect(store.create(input())).resolves.toBeNull()
    expect(store.error).toBe('保存失败')
    expect(store.isSaving).toBe(false)

    service.failDelete = true
    await expect(store.remove('A-001')).resolves.toBe(false)
    expect(store.error).toBe('删除失败')
    expect(store.records).toHaveLength(1)
    expect(store.deletingId).toBeNull()
  })
})
