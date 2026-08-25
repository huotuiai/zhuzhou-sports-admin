import type { TrafficControl, TrafficControlService, TrafficControlWriteInput } from '../types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createTrafficControlStore, deriveTrafficControlTimeStatus } from './traffic-control-store'

function record(id: string, overrides: Partial<TrafficControl> = {}): TrafficControl {
  return {
    id,
    code: id,
    title: `管制 ${id}`,
    type: 'road-closure',
    areaName: '体育中心',
    startAt: '2026-08-18T10:00:00+08:00',
    endAt: '2026-08-18T12:00:00+08:00',
    detourInstructions: '',
    geometry: null,
    areaSquareMeters: null,
    publishStatus: 'published',
    publisher: '张警官',
    publishAt: '2026-08-18T08:00:00+08:00',
    pinned: false,
    sortOrder: 10,
    coordinateSystem: 'GCJ-02',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  }
}

class StubTrafficControlService implements TrafficControlService {
  records: TrafficControl[] = []
  async list(): Promise<TrafficControl[]> { return structuredClone(this.records) }
  async create(input: TrafficControlWriteInput): Promise<TrafficControl> {
    const next = record(`GZ-${String(this.records.length + 1).padStart(3, '0')}`, { ...input })
    this.records.push(next)
    return structuredClone(next)
  }
  async update(id: string, input: TrafficControlWriteInput): Promise<TrafficControl> {
    const index = this.records.findIndex((item) => item.id === id)
    const next = { ...this.records[index]!, ...input }
    this.records[index] = next
    return structuredClone(next)
  }
  async remove(id: string): Promise<void> { this.records = this.records.filter((item) => item.id !== id) }
  async publish(id: string): Promise<TrafficControl> {
    const item = this.records.find((record) => record.id === id)!
    item.publishStatus = 'published'
    item.publishAt = '2026-08-18T03:00:00.000Z'
    return structuredClone(item)
  }
  async revoke(id: string): Promise<TrafficControl> {
    const item = this.records.find((record) => record.id === id)!
    item.publishStatus = 'revoked'
    return structuredClone(item)
  }
}

describe('traffic control store', () => {
  let service: StubTrafficControlService
  let currentTime: Date

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubTrafficControlService()
    currentTime = new Date('2026-08-18T11:00:00+08:00')
  })

  it('derives time status at runtime', () => {
    expect(deriveTrafficControlTimeStatus(record('A'), new Date('2026-08-18T09:00:00+08:00'))).toBe('upcoming')
    expect(deriveTrafficControlTimeStatus(record('A'), currentTime)).toBe('active')
    expect(deriveTrafficControlTimeStatus(record('A'), new Date('2026-08-18T13:00:00+08:00'))).toBe('ended')
  })

  it('combines keyword, type, time and intersecting date-range filters', async () => {
    service.records = [
      record('GZ-001', { title: '东门封路', areaName: '东环路' }),
      record('GZ-002', { title: '南门绕行', type: 'detour', startAt: '2026-08-20T10:00:00+08:00', endAt: '2026-08-21T12:00:00+08:00' }),
      record('GZ-003', { title: '西门历史限行', type: 'restriction', startAt: '2026-08-10T10:00:00+08:00', endAt: '2026-08-11T12:00:00+08:00' }),
    ]
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-filter')()
    await store.load()
    store.setQuery({ keyword: '南门', type: 'detour', publishStatus: 'published', timeStatus: 'upcoming', dateStart: '2026-08-21', dateEnd: '2026-08-22' })
    expect(store.filteredRecords.map((item) => item.id)).toEqual(['GZ-002'])
    store.setQuery({ keyword: '', type: 'all', timeStatus: 'ended', dateStart: '', dateEnd: '' })
    expect(store.filteredRecords.map((item) => item.id)).toEqual(['GZ-003'])
  })

  it('sorts pinned records first, paginates, toggles pin and permits empty geometry', async () => {
    service.records = Array.from({ length: 22 }, (_, index) => record(`GZ-${String(index + 1).padStart(3, '0')}`, {
      pinned: index === 5,
      sortOrder: index === 5 ? 99 : index,
      startAt: `2026-08-18T${String(10 + index % 2).padStart(2, '0')}:00:00+08:00`,
    }))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-sort')()
    await store.load()
    expect(store.filteredRecords[0]?.id).toBe('GZ-006')
    expect(store.paginatedRecords).toHaveLength(20)
    store.setPage(2)
    expect(store.paginatedRecords).toHaveLength(2)
    const toggled = await store.togglePinned(store.records.find((item) => item.id === 'GZ-001')!)
    expect(toggled?.pinned).toBe(true)
    expect(store.validate({ title: '新管制', type: 'other', areaName: '北门', startAt: '2026-08-18T12:00', endAt: '2026-08-18T13:00', detourInstructions: '', geometry: null, publishAt: null, pinned: false, sortOrder: 0 }, 'create').valid).toBe(true)
  })

  it('filters publication status and updates publish/revoke transitions', async () => {
    service.records = [record('GZ-001', { publishStatus: 'draft', publishAt: null }), record('GZ-002')]
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-publish')()
    await store.load()
    store.setQuery({ publishStatus: 'draft' })
    expect(store.filteredRecords.map((item) => item.id)).toEqual(['GZ-001'])
    const published = await store.publish(store.records[0]!)
    expect(published?.publishStatus).toBe('published')
    expect((await store.revoke(published!))?.publishStatus).toBe('revoked')
  })
})
