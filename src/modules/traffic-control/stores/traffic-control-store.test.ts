import type {
  TrafficControl,
  TrafficControlExportFile,
  TrafficControlPage,
  TrafficControlServerQuery,
  TrafficControlService,
  TrafficControlWriteInput,
} from '../types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    publisherName: '张三',
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
    publishAt: null,
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
  exportQueries: TrafficControlServerQuery[] = []
  detailReads: string[] = []
  updateInputs: Array<{ id: string, input: TrafficControlWriteInput }> = []
  failDelete: Error | null = null
  exportFile: TrafficControlExportFile = { content: new Blob(['csv']), filename: 'control_zones.csv' }

  listCalls: Array<[number, number]> = []
  mapQueries: TrafficControlServerQuery[] = []

  async list(query: TrafficControlServerQuery): Promise<TrafficControl[]> {
    this.mapQueries.push({ ...query })
    return structuredClone(this.records)
  }

  async listPage(page: number, pageSize: number, query: TrafficControlServerQuery): Promise<TrafficControlPage> {
    this.listQueries.push({ ...query })
    this.listCalls.push([page, pageSize])
    return { records: structuredClone(this.records.slice((page - 1) * pageSize, page * pageSize)), total: this.records.length, page, pageSize }
  }

  async get(id: string): Promise<TrafficControl> {
    this.detailReads.push(id)
    const detail = this.details.get(id) ?? this.records.find(item => item.id === id)
    if (!detail) throw new Error('交通管制记录不存在')
    return structuredClone(detail)
  }

  async create(value: TrafficControlWriteInput): Promise<TrafficControl> {
    const next = record('GZ-' + String(this.records.length + 1).padStart(3, '0'), { ...value, publishStatus: 'draft' })
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

  async export(query: TrafficControlServerQuery): Promise<TrafficControlExportFile> { this.exportQueries.push({ ...query }); return this.exportFile }
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

  it('forwards every filter and trusts backend records without filtering or sorting again', async () => {
    service.records = [
      record('GZ-001', { title: '东门封路', areaName: '东环路' }),
      record('GZ-002', { title: '南门绕行', type: 'detour', startAt: '2026-08-20T10:00:00+08:00', endAt: '2026-08-21T12:00:00+08:00' }),
      record('GZ-003', { title: '西门历史限行', type: 'restriction', startAt: '2026-08-10T10:00:00+08:00', endAt: '2026-08-11T12:00:00+08:00' }),
    ]
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-filter')()
    await store.load()
    await store.setQuery({ keyword: '南门', type: 'detour', publishStatus: 'published', timeStatus: 'upcoming', dateStart: '2026-08-21', dateEnd: '2026-08-22' })
    expect(service.listQueries.at(-1)).toEqual({ keyword: '南门', type: 'detour', publishStatus: 'published', timeStatus: 'upcoming', dateStart: '2026-08-21', dateEnd: '2026-08-22' })
    expect(store.records.map(item => item.id)).toEqual(['GZ-001', 'GZ-002', 'GZ-003'])
    await store.setQuery({ keyword: '', type: 'all', timeStatus: 'ended', dateStart: '', dateEnd: '' })
    expect(store.records).toHaveLength(3)
    expect(store.total).toBe(3)
  })

  it('loads a single server page and keeps the full map response separately', async () => {
    service.records = Array.from({ length: 22 }, (_, index) => record('GZ-' + String(index + 1).padStart(3, '0'), {
      pinned: index === 5,
      sortOrder: index === 5 ? 99 : index,
    }))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-pages')()
    await store.load()
    expect(store.records).toHaveLength(20)
    expect(store.total).toBe(22)
    expect(store.records[0]?.id).toBe('GZ-001')
    expect(store.records).toHaveLength(20)
    await store.setPage(2)
    expect(store.records).toHaveLength(2)
    expect(service.listCalls).toEqual([[1, 20], [2, 20]])

    expect(await store.setPageSize(50)).toBe(true)
    expect(store.pageSize).toBe(50)
    expect(store.currentPage).toBe(1)
    expect(store.records).toHaveLength(22)
    expect(service.listCalls.at(-1)).toEqual([1, 50])

    expect(await store.loadMap()).toBe(true)
    expect(store.mapRecords).toHaveLength(22)
    expect(service.mapQueries).toEqual([service.listQueries.at(-1)])
    expect(service.listCalls).toHaveLength(3)
  })

  it('reads detail before editing and refreshes after CRUD mutations', async () => {
    service.records = [record('GZ-001', { publishStatus: 'draft' })]
    service.details.set('GZ-001', record('GZ-001', { title: '接口最新标题', publishStatus: 'draft' }))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-crud')()
    await store.load()
    await expect(store.get('GZ-001')).resolves.toMatchObject({ title: '接口最新标题' })
    await expect(store.create(input({ publishAt: '2026-08-20T11:00' }))).resolves.toMatchObject({ publishStatus: 'draft', publishAt: '2026-08-20T11:00' })
    await expect(store.update('GZ-001', input({ title: '修改标题' }))).resolves.toMatchObject({ title: '修改标题', publishAt: null })
    await expect(store.remove('GZ-001')).resolves.toBe(true)
    expect(service.detailReads).toEqual(['GZ-001'])
    expect(service.listQueries).toHaveLength(4)
  })

  it('reads the latest detail before toggling pinned and then refreshes', async () => {
    service.records = [record('GZ-001', { title: '列表旧标题', pinned: false })]
    service.details.set('GZ-001', record('GZ-001', { title: '接口最新标题', pinned: false, publishAt: '2026-08-18T09:20:35+08:00' }))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-pin')()
    await store.load()
    const updated = await store.togglePinned(service.records[0]!)
    expect(service.detailReads).toEqual(['GZ-001'])
    expect(service.updateInputs[0]).toMatchObject({ id: 'GZ-001', input: { title: '接口最新标题', pinned: true, publishAt: '2026-08-18T09:20:35+08:00' } })
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
    await store.setQuery({ keyword: '东门', type: 'restriction', publishStatus: 'published', timeStatus: 'ended', dateStart: '2026-08-01', dateEnd: '2026-08-31' })
    await expect(store.exportCurrent()).resolves.toBe(service.exportFile)
    expect(service.exportQueries).toEqual([service.listQueries.at(-1)])
    service.export = async () => { throw new Error('导出接口不可用') }
    await expect(store.exportCurrent()).resolves.toBeNull()
    expect(store.error).toBe('导出接口不可用')
  })

  it('preserves the applied query, records and pagination when requests fail', async () => {
    service.records = Array.from({ length: 45 }, (_, index) => record(String(index + 1)))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-failure')()
    await store.setQuery({ keyword: '管制', publishStatus: 'published' })
    await store.setPage(2)
    const previous = store.records.map(item => item.id)
    const filters = { ...store.query }
    vi.spyOn(service, 'listPage').mockRejectedValue(new Error('列表请求失败'))
    for (const request of [
      () => store.setQuery({ keyword: '其他' }),
      () => store.setPage(3),
      () => store.setPageSize(50),
      () => store.resetQuery(),
    ]) {
      expect(await request()).toBe(false)
      expect(store.query).toEqual(filters)
      expect(store.records.map(item => item.id)).toEqual(previous)
      expect(store.page).toBe(2)
      expect(store.pageSize).toBe(20)
      expect(store.total).toBe(45)
      expect(store.isLoading).toBe(false)
    }
  })

  it('does not allow an older list or map response to overwrite a newer query', async () => {
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-race')()
    let finishList!: (page: TrafficControlPage) => void
    vi.spyOn(service, 'listPage').mockImplementationOnce(() => new Promise(resolve => { finishList = resolve }))
    const older = store.setQuery({ keyword: '旧查询' })
    service.records = [record('new')]
    await store.setQuery({ keyword: '新查询' })
    finishList({ records: [record('old')], total: 100, page: 1, pageSize: 20 })
    await older
    expect(store.query.keyword).toBe('新查询')
    expect(store.records.map(item => item.id)).toEqual(['new'])
    expect(store.total).toBe(1)
    let finishMap!: (records: TrafficControl[]) => void
    vi.spyOn(service, 'list').mockImplementationOnce(() => new Promise(resolve => { finishMap = resolve }))
    const olderMap = store.setQuery({ keyword: '旧地图' }, 'map')
    await store.setQuery({ keyword: '新地图' }, 'map')
    finishMap([record('stale-map')])
    await olderMap
    expect(store.query.keyword).toBe('新地图')
    expect(store.mapRecords.map(item => item.id)).toEqual(['new'])
    expect(store.isLoading).toBe(false)
  })

  it('queries the map independently, keeps its previous data on failure and refreshes the list on return', async () => {
    service.records = Array.from({ length: 125 }, (_, index) => record(String(index + 1)))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-map')()
    await store.load()
    const filters = { keyword: '后端匹配', timeStatus: 'ended' as const, dateStart: '2026-08-01', dateEnd: '2026-08-30' }
    expect(await store.setQuery(filters, 'map')).toBe(true)
    expect(service.listCalls).toEqual([[1, 20]])
    expect(service.mapQueries.at(-1)).toMatchObject(filters)
    expect(store.mapRecords).toHaveLength(125)
    expect(store.mapRecords[0]?.id).toBe('1')
    expect(store.records).toHaveLength(20)
    vi.spyOn(service, 'list').mockRejectedValueOnce(new Error('地图不可用'))
    expect(await store.setQuery({ keyword: '失败' }, 'map')).toBe(false)
    expect(store.query.keyword).toBe('后端匹配')
    expect(store.mapRecords).toHaveLength(125)
    expect(await store.load()).toBe(true)
    expect(service.listQueries.at(-1)).toMatchObject(filters)
    expect(store.total).toBe(125)
  })

  it('refreshes only the current view for an active time filter and does not filter rows locally', async () => {
    service.records = [record('1')]
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-time-refresh')()
    await store.load()
    await store.refreshTime('list')
    expect(service.listCalls).toHaveLength(1)
    await store.setQuery({ timeStatus: 'active' })
    currentTime = new Date('2026-08-18T13:00:00+08:00')
    await store.refreshTime('list')
    expect(service.listCalls).toHaveLength(3)
    expect(store.records).toHaveLength(1)
    expect(store.total).toBe(1)
    await store.refreshTime('map')
    expect(service.listCalls).toHaveLength(3)
    expect(service.mapQueries.at(-1)?.timeStatus).toBe('active')
  })

  it('backs up to the last valid page after deletion and reports post-write refresh failures as warnings', async () => {
    service.records = Array.from({ length: 21 }, (_, index) => record(String(index + 1)))
    const store = createTrafficControlStore(service, () => currentTime, 'traffic-delete-page')()
    await store.load()
    await store.setPage(2)
    expect(await store.remove('21')).toBe(true)
    expect(service.listCalls.slice(-2)).toEqual([[2, 20], [1, 20]])
    expect(store.page).toBe(1)
    expect(store.total).toBe(20)
    expect(store.records).toHaveLength(20)
    vi.spyOn(service, 'listPage').mockRejectedValueOnce(new Error('列表不可用'))
    expect(await store.create(input())).not.toBeNull()
    expect(store.total).toBe(20)
    expect(store.error).toBe('操作已成功，但最新数据刷新失败：列表不可用')
    expect(store.isSaving).toBe(false)
  })

})
