import type {
  TrafficControl,
  TrafficControlExportFile,
  TrafficControlPage,
  TrafficControlServerQuery,
  TrafficControlService,
  TrafficControlWriteInput,
} from '../types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createTrafficControlStore, deriveTrafficControlTimeStatus } from './traffic-control-store'

function record(id: string, overrides: Partial<TrafficControl> = {}): TrafficControl {
  return {
    id,
    code: id,
    title: '管制 ' + id,
    type: 'road-closure',
    areaName: '体育中心',
    startAt: '2026-08-18T10:00:00+08:00',
    endAt: '2026-08-18T12:00:00+08:00',
    detourInstructions: '',
    geometry: null,
    areaSquareMeters: null,
    publishStatus: 'published',
    publisherId: '9',
    publishAt: '2026-08-18T08:00:00+08:00',
    pinned: false,
    sortOrder: 10,
    remark: '',
    dataSource: 'manual',
    syncStatus: null,
    lastSyncAt: null,
    externalId: null,
    overlaps: [],
    coordinateSystem: 'GCJ-02',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  }
}

function input(overrides: Partial<TrafficControlWriteInput> = {}): TrafficControlWriteInput {
  return {
    title: '新增管制',
    type: 'other',
    areaName: '北门',
    startAt: '2026-08-20T12:00',
    endAt: '2026-08-20T13:00',
    detourInstructions: '',
    geometry: null,
    pinned: false,
    sortOrder: 0,
    ...overrides,
  }
}

class StubTrafficControlService implements TrafficControlService {
  records: TrafficControl[] = []
  details = new Map<string, TrafficControl>()
  listQueries: TrafficControlServerQuery[] = []
  detailReads: string[] = []
  updateInputs: Array<{ id: string, input: TrafficControlWriteInput }> = []
  failDelete: Error | null = null
  exportFile: TrafficControlExportFile = { content: new Blob(['csv']), filename: 'control_zones.csv' }

  async list(query: TrafficControlServerQuery = { keyword: '', type: 'all', publishStatus: 'all' }): Promise<TrafficControl[]> {
    this.listQueries.push({ ...query })
    return structuredClone(this.records)
  }

  async listPage(): Promise<TrafficControlPage> {
    return { records: structuredClone(this.records), total: this.records.length, page: 1, pageSize: 100 }
  }

  async get(id: string): Promise<TrafficControl> {
    this.detailReads.push(id)
    const detail = this.details.get(id) ?? this.records.find(item => item.id === id)
    if (!detail) throw new Error('交通管制记录不存在')
    return structuredClone(detail)
  }

  async create(value: TrafficControlWriteInput): Promise<TrafficControl> {
    const next = record('GZ-' + String(this.records.length + 1).padStart(3, '0'), { ...value, publishStatus: 'draft', publishAt: null })
    this.records.push(next)
    return structuredClone(next)
  }

  async update(id: string, value: TrafficControlWriteInput): Promise<TrafficControl> {
    this.updateInputs.push({ id, input: structuredClone(value) })
    const index = this.records.findIndex(item => item.id === id)
    const previous = index >= 0 ? this.records[index]! : this.details.get(id)!
    const next = { ...previous, ...value }
    if (index >= 0) this.records[index] = next
    else this.records.push(next)
    return structuredClone(next)
  }

  async remove(id: string): Promise<void> {
    if (this.failDelete) throw this.failDelete
    this.records = this.records.filter(item => item.id !== id)
  }

  async publish(id: string): Promise<TrafficControl> {
    const item = this.records.find(record => record.id === id)!
    item.publishStatus = 'published'
    item.publishAt = '2026-08-18T03:00:00.000Z'
    return structuredClone({ ...item, overlaps: [{ kind: 'parking', id: '1', name: 'P1 停车场' }] })
  }

  async revoke(id: string): Promise<TrafficControl> {
    const item = this.records.find(record => record.id === id)!
    item.publishStatus = 'revoked'
    return structuredClone(item)
  }

  async export(): Promise<TrafficControlExportFile> { return this.exportFile }
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

  it('loads with server-supported filters and applies time/date filters to the complete result', async () => {
    service.records = [
      record('GZ-001', { title: '东门封路', areaName: '东环路' }),
      record('GZ-002', { title: '南门绕行', type: 'detour', startAt: '2026-08-20T10:00:00+08:00', endAt: '2026-08-21T12:00:00+08:00' }),
      record('GZ-003', { title: '西门历史限行', type: 'restriction', startAt: '2026-08-10T10:00:00+08:00', endAt: '2026-08-11T12:00:00+08:00' }),
    ]
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-filter')()
    await store.load()
    await store.setQuery({ keyword: '南门', type: 'detour', publishStatus: 'published', timeStatus: 'upcoming', dateStart: '2026-08-21', dateEnd: '2026-08-22' })
    expect(service.listQueries.at(-1)).toEqual({ keyword: '南门', type: 'detour', publishStatus: 'published' })
    expect(store.filteredRecords.map(item => item.id)).toEqual(['GZ-002'])
    await store.setQuery({ keyword: '', type: 'all', timeStatus: 'ended', dateStart: '', dateEnd: '' })
    expect(store.filteredRecords.map(item => item.id)).toEqual(['GZ-003'])
  })

  it('keeps front-end paging and full filtered map data', async () => {
    service.records = Array.from({ length: 22 }, (_, index) => record('GZ-' + String(index + 1).padStart(3, '0'), {
      pinned: index === 5,
      sortOrder: index === 5 ? 99 : index,
    }))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-pages')()
    await store.load()
    expect(store.filteredRecords).toHaveLength(22)
    expect(store.filteredRecords[0]?.id).toBe('GZ-006')
    expect(store.paginatedRecords).toHaveLength(20)
    store.setPage(2)
    expect(store.paginatedRecords).toHaveLength(2)
  })

  it('reads detail before editing and refreshes after CRUD mutations', async () => {
    service.records = [record('GZ-001', { publishStatus: 'draft' })]
    service.details.set('GZ-001', record('GZ-001', { title: '接口最新标题', publishStatus: 'draft' }))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-crud')()
    await store.load()
    await expect(store.get('GZ-001')).resolves.toMatchObject({ title: '接口最新标题' })
    await expect(store.create(input())).resolves.toMatchObject({ publishStatus: 'draft' })
    await expect(store.update('GZ-001', input({ title: '修改标题' }))).resolves.toMatchObject({ title: '修改标题' })
    await expect(store.remove('GZ-001')).resolves.toBe(true)
    expect(service.detailReads).toEqual(['GZ-001'])
    expect(service.listQueries).toHaveLength(4)
  })

  it('reads the latest detail before toggling pinned and then refreshes', async () => {
    service.records = [record('GZ-001', { title: '列表旧标题', pinned: false })]
    service.details.set('GZ-001', record('GZ-001', { title: '接口最新标题', pinned: false }))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-pin')()
    await store.load()
    const updated = await store.togglePinned(service.records[0]!)
    expect(service.detailReads).toEqual(['GZ-001'])
    expect(service.updateInputs[0]).toMatchObject({ id: 'GZ-001', input: { title: '接口最新标题', pinned: true } })
    expect(updated?.pinned).toBe(true)
  })

  it('returns publish overlaps, refreshes status transitions and passes delete failures through', async () => {
    service.records = [record('GZ-001', { publishStatus: 'draft', publishAt: null })]
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-actions')()
    await store.load()
    const published = await store.publish(service.records[0]!)
    expect(published?.overlaps).toEqual([{ kind: 'parking', id: '1', name: 'P1 停车场' }])
    expect((await store.revoke(service.records[0]!))?.publishStatus).toBe('revoked')
    service.failDelete = new Error('只有草稿状态的管制可以删除')
    expect(await store.remove('GZ-001')).toBe(false)
    expect(store.error).toBe('只有草稿状态的管制可以删除')
  })

  it('returns the raw server export file and exposes export failures', async () => {
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-export')()
    await expect(store.exportAll()).resolves.toBe(service.exportFile)
    service.export = async () => { throw new Error('导出接口不可用') }
    await expect(store.exportAll()).resolves.toBeNull()
    expect(store.error).toBe('导出接口不可用')
  })
})
