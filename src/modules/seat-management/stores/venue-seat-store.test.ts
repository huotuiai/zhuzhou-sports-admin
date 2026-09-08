import type { BackendCsvExportFile } from '@/lib/http'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  SeatFloor,
  SeatFloorCreateInput,
  SeatGateOption,
  SeatPlanningQuery,
  SeatPlanningService,
  SeatZone,
  SeatZoneImportResult,
  SeatZonePage,
  SeatZoneWriteInput,
} from '../types'
import { createSeatPlanningStore } from './venue-seat-store'

const timestamp = '2026-08-26T08:00:00+08:00'

function cloneZone(value: SeatZone): SeatZone {
  return {
    ...value,
    gateIds: [...value.gateIds],
    gateNames: [...value.gateNames],
    openGateIds: [...value.openGateIds],
    openGateNames: [...value.openGateNames],
  }
}

function zone(index: number): SeatZone {
  const gateId = index % 2 ? 'gate-1' : 'gate-2'
  return {
    id: `zone-${index}`,
    code: `A-${String(index).padStart(3, '0')}`,
    name: index % 2 ? `东看台 ${index}` : `西看台 ${index}`,
    floorId: index <= 60 ? 'floor-1' : 'floor-2',
    rowStart: 1,
    rowEnd: 20,
    gateIds: [gateId],
    gateNames: [gateId === 'gate-1' ? '东检票口' : '南检票口'],
    openGateIds: [gateId],
    openGateNames: [gateId === 'gate-1' ? '东检票口' : '南检票口'],
    sortOrder: index,
    status: index % 3 ? 'enabled' : 'disabled',
    remark: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const gates: SeatGateOption[] = [
  { id: 'gate-1', code: 'G-01', name: '东检票口', openStatus: 'open', enabled: true, matchOpen: true },
  { id: 'gate-2', code: 'G-02', name: '南检票口', openStatus: 'restricted', enabled: true, matchOpen: false },
]

class FakeService implements SeatPlanningService {
  readonly listZoneCalls: Array<[number, number]> = []
  readonly listZoneQueries: SeatPlanningQuery[] = []
  readonly createZoneInputs: SeatZoneWriteInput[] = []
  readonly updateZoneInputs: Array<{ id: string, input: SeatZoneWriteInput }> = []
  readonly detailCalls: string[] = []
  readonly importCsvInputs: string[] = []
  exportCalls = 0
  exportQueries: SeatPlanningQuery[] = []
  failNextZoneList = false
  failExport = false
  failImport = false
  exportPromise: Promise<BackendCsvExportFile> | null = null
  importPromise: Promise<SeatZoneImportResult> | null = null
  importedZone: SeatZone | null = null
  gateOptions = gates.map(item => ({ ...item }))
  private nextZoneId = 1000
  private nextFloorId = 10
  private floors: SeatFloor[] = [
    { id: 'floor-2', name: '二层', sortOrder: 2, status: 'enabled', zoneCount: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: 'floor-1', name: '一层', sortOrder: 1, status: 'enabled', zoneCount: 0, createdAt: timestamp, updatedAt: timestamp },
  ]
  private zones: SeatZone[]

  constructor(zoneCount = 125) {
    this.zones = Array.from({ length: zoneCount }, (_, index) => zone(index + 1)).reverse()
  }

  async listFloors(): Promise<SeatFloor[]> {
    return this.floors.map(floor => ({
      ...floor,
      zoneCount: this.zones.filter(item => item.floorId === floor.id).length,
    }))
  }

  async createFloor(input: SeatFloorCreateInput): Promise<SeatFloor> {
    const floor: SeatFloor = {
      id: `floor-${++this.nextFloorId}`,
      name: input.name,
      sortOrder: input.sortOrder,
      status: input.status,
      zoneCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.floors.push(floor)
    return { ...floor }
  }

  async deleteFloor(id: string): Promise<void> {
    this.floors = this.floors.filter(item => item.id !== id)
  }

  async listZones(page: number, pageSize: number, filters = query()): Promise<SeatZonePage> {
    this.listZoneCalls.push([page, pageSize])
    this.listZoneQueries.push({ ...filters, gateIds: [...filters.gateIds] })
    if (this.failNextZoneList) {
      this.failNextZoneList = false
      throw new Error('分区列表加载失败')
    }
    const matches = this.zones.filter(item =>
      (!filters.keyword || item.code.includes(filters.keyword) || item.name.includes(filters.keyword)) &&
      (filters.floorId === 'all' || item.floorId === filters.floorId) &&
      (filters.status === 'all' || item.status === filters.status) &&
      (!filters.gateIds.length || item.gateIds.some(id => filters.gateIds.includes(id))),
    ).sort((first, second) => first.sortOrder - second.sortOrder)
    const start = (page - 1) * pageSize
    return {
      zones: matches.slice(start, start + pageSize).map(cloneZone),
      total: matches.length,
      page,
      pageSize,
    }
  }

  async getZone(id: string): Promise<SeatZone> {
    this.detailCalls.push(id)
    const found = this.zones.find(item => item.id === id)
    if (!found) throw new Error('分区不存在')
    return cloneZone(found)
  }

  async createZone(input: SeatZoneWriteInput): Promise<SeatZone> {
    this.createZoneInputs.push({ ...input, gateIds: [...input.gateIds] })
    const created: SeatZone = {
      id: `zone-${++this.nextZoneId}`,
      ...input,
      gateIds: [...input.gateIds],
      gateNames: input.gateIds.map(id => gates.find(item => item.id === id)?.name ?? id),
      openGateIds: [...input.gateIds],
      openGateNames: input.gateIds.map(id => gates.find(item => item.id === id)?.name ?? id),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.zones.push(created)
    return cloneZone(created)
  }

  async updateZone(id: string, input: SeatZoneWriteInput): Promise<SeatZone> {
    this.updateZoneInputs.push({ id, input: { ...input, gateIds: [...input.gateIds] } })
    const index = this.zones.findIndex(item => item.id === id)
    if (index < 0) throw new Error('分区不存在')
    const current = this.zones[index]!
    const updated: SeatZone = {
      ...current,
      ...input,
      code: current.code,
      gateIds: [...input.gateIds],
      gateNames: input.gateIds.map(gateId => gates.find(item => item.id === gateId)?.name ?? gateId),
      openGateIds: [...input.gateIds],
      openGateNames: input.gateIds.map(gateId => gates.find(item => item.id === gateId)?.name ?? gateId),
      updatedAt: timestamp,
    }
    this.zones[index] = updated
    return cloneZone(updated)
  }

  async deleteZone(id: string): Promise<void> {
    this.zones = this.zones.filter(item => item.id !== id)
  }

  async exportCsv(query: SeatPlanningQuery): Promise<BackendCsvExportFile> {
    this.exportCalls += 1
    this.exportQueries.push({ ...query, gateIds: [...query.gateIds] })
    if (this.failExport) throw new Error('分区导出失败')
    if (this.exportPromise) return this.exportPromise
    return {
      content: new Blob(['编号,名称']),
      filename: 'seat_zones.csv',
      truncated: false,
      count: null,
      total: null,
    }
  }

  async importCsv(csv: string): Promise<SeatZoneImportResult> {
    this.importCsvInputs.push(csv)
    if (this.failImport) throw new Error('分区导入失败')
    const result = this.importPromise ? await this.importPromise : { imported: 1 }
    if (this.importedZone && !this.zones.some(item => item.id === this.importedZone!.id)) {
      this.zones.push(cloneZone(this.importedZone))
    }
    return result
  }

  async listGateOptions(): Promise<SeatGateOption[]> {
    return this.gateOptions.map(item => ({ ...item }))
  }
}

function query(overrides: Partial<SeatPlanningQuery> = {}): SeatPlanningQuery {
  return { keyword: '', floorId: 'all', status: 'all', gateIds: [], ...overrides }
}

function zoneInput(overrides: Partial<SeatZoneWriteInput> = {}): SeatZoneWriteInput {
  return {
    code: ' b-01 ', name: ' 新增区域 ', floorId: 'floor-1', rowStart: 1, rowEnd: 25,
    gateIds: ['gate-1'], sortOrder: 130, status: 'enabled', remark: '', ...overrides,
  }
}

describe('seat planning store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('requests only the selected server page and forwards all filters through pagination and reset', async () => {
    const service = new FakeService()
    const useStore = createSeatPlanningStore(service, `seat-planning-${Math.random()}`)
    const store = useStore()

    expect(await store.initialize()).toBe(true)
    expect(service.listZoneCalls).toEqual([[1, 20]])
    expect(service.listZoneQueries).toEqual([query()])
    expect(store.zones).toHaveLength(20)
    expect(store.zones[0]?.id).toBe('zone-1')
    expect(store.total).toBe(125)
    expect(store.totalZoneCount('floor-1')).toBe(60)
    expect(store.totalZoneCount('floor-2')).toBe(65)

    await store.queryZones(query({ gateIds: ['gate-1'] }))
    expect(service.listZoneQueries.at(-1)).toEqual(query({ gateIds: ['gate-1'] }))
    expect(store.total).toBe(63)
    expect(await store.setPage(2)).toBe(true)
    expect(service.listZoneCalls.at(-1)).toEqual([2, 20])
    expect(service.listZoneQueries.at(-1)).toEqual(query({ gateIds: ['gate-1'] }))
    expect(store.zones[0]?.id).toBe('zone-41')
    expect(store.zones).toHaveLength(20)
    expect(store.currentPage).toBe(2)
    await store.queryZones(query({ gateIds: ['gate-1', 'gate-2'] }))
    expect(service.listZoneQueries.at(-1)).toEqual(query({ gateIds: ['gate-1', 'gate-2'] }))
    expect(store.currentPage).toBe(1)
    expect(store.total).toBe(125)
    const filters = query({ keyword: '东看台', floorId: 'floor-1', status: 'enabled', gateIds: ['gate-1', 'gate-2'] })
    await store.queryZones({ ...filters, keyword: ' 东看台 ' })
    expect(service.listZoneQueries.at(-1)).toEqual(filters)
    expect(store.total).toBe(20)

    expect(await store.setPageSize(50)).toBe(true)
    expect(store.pageSize).toBe(50)
    expect(store.currentPage).toBe(1)
    expect(service.listZoneQueries.at(-1)).toEqual(filters)
    expect(service.listZoneCalls).toEqual([[1, 20], [1, 20], [2, 20], [1, 20], [1, 20], [1, 50]])
    expect(await store.resetQuery()).toBe(true)
    expect(service.listZoneCalls.at(-1)).toEqual([1, 50])
    expect(service.listZoneQueries.at(-1)).toEqual(query())
    expect(store.zones).toHaveLength(50)
    expect(store.total).toBe(125)
  })

  it('displays the backend page and total without applying local filtering or sorting', async () => {
    const service = new FakeService()
    const store = createSeatPlanningStore(service, 'seat-server-authority')()
    await store.initialize()
    const backendPage = { zones: [zone(42), zone(1)], total: 82, page: 1, pageSize: 20 }
    vi.spyOn(service, 'listZones').mockResolvedValue(backendPage)

    await store.queryZones(query({ keyword: '后端别名查询', floorId: 'floor-2', status: 'disabled', gateIds: ['gate-3'] }))

    expect(store.zones).toEqual(backendPage.zones)
    expect(store.total).toBe(82)
    expect(store.pageCount).toBe(5)
    await store.getZone('zone-125')
    expect(store.zones).toEqual(backendPage.zones)
    expect(store.total).toBe(82)
  })

  it('refreshes changed gate options on re-entry while preserving filters and the current page', async () => {
    const service = new FakeService()
    const useStore = createSeatPlanningStore(service, `seat-refresh-${Math.random()}`)
    const store = useStore()
    await store.initialize()
    await store.queryZones(query({ keyword: '看台', gateIds: ['gate-1'] }))
    await store.setPage(2)

    service.gateOptions = [
      { ...service.gateOptions[0]!, openStatus: 'closed', matchOpen: false },
      ...service.gateOptions.slice(1),
      { id: 'gate-3', code: 'G-03', name: '北检票口', openStatus: 'open', enabled: true, matchOpen: true },
    ]
    service.failNextZoneList = true
    expect(await store.refresh()).toBe(false)
    expect(store.ticketGates).toEqual(gates)

    expect(await store.refresh()).toBe(true)
    expect(store.ticketGates.map(item => item.id)).toEqual(['gate-1', 'gate-2', 'gate-3'])
    expect(store.gateById.get('gate-1')).toMatchObject({ openStatus: 'closed', matchOpen: false })
    expect(store.query).toEqual(query({ keyword: '看台', gateIds: ['gate-1'] }))
    expect(store.page).toBe(2)
    expect(service.listZoneCalls).toEqual([[1, 20], [1, 20], [2, 20], [2, 20], [2, 20]])
  })

  it('uses detail and CRUD APIs while preserving immutable codes and authoritative floor counts', async () => {
    const service = new FakeService(4)
    const useStore = createSeatPlanningStore(service, `seat-planning-${Math.random()}`)
    const store = useStore()
    await store.initialize()

    expect(store.totalZoneCount('floor-1')).toBe(4)
    expect((await store.getZone('zone-1'))?.id).toBe('zone-1')
    expect(service.detailCalls).toEqual(['zone-1'])

    const created = await store.createZone(zoneInput())
    expect(created?.code).toBe('B-01')
    expect(service.createZoneInputs[0]).toMatchObject({ code: 'B-01', name: '新增区域' })
    expect(store.totalZoneCount('floor-1')).toBe(5)

    const updated = await store.updateZone(created!.id, zoneInput({ code: 'C-99', name: '调整后' }))
    expect(updated).toMatchObject({ code: 'B-01', name: '调整后' })
    expect(await store.removeZone(created!.id)).toBe(false)
    expect(store.error).toContain('先停用')
    expect((await store.updateStatus(created!.id, 'disabled'))?.status).toBe('disabled')
    expect(await store.removeZone(created!.id)).toBe(true)
    expect(store.totalZoneCount('floor-1')).toBe(4)

    const floor = await store.createFloor({ name: ' 三层 ' })
    expect(floor).toMatchObject({ name: '三层', sortOrder: 3, status: 'enabled' })
    expect(await store.removeFloor(floor!.id)).toBe(true)
  })

  it('submits existing floor names and zone codes and surfaces backend conflicts', async () => {
    const service = new FakeService(2)
    const store = createSeatPlanningStore(service, 'seat-planning-conflicts')()
    await store.initialize()
    const createFloor = vi.spyOn(service, 'createFloor').mockRejectedValue(new Error('接口返回：楼层名称冲突'))
    const createZone = vi.spyOn(service, 'createZone').mockRejectedValue(new Error('接口返回：分区编号冲突'))
    const updateZone = vi.spyOn(service, 'updateZone').mockRejectedValue(new Error('接口返回：分区更新冲突'))

    expect(await store.createFloor({ name: '一层' })).toBeNull()
    expect(createFloor).toHaveBeenCalledTimes(1)
    expect(store.error).toBe('接口返回：楼层名称冲突')
    expect(await store.createZone(zoneInput({ code: 'A-001' }))).toBeNull()
    expect(createZone).toHaveBeenCalledTimes(1)
    expect(store.error).toBe('接口返回：分区编号冲突')
    expect(await store.updateZone('zone-2', zoneInput({ code: 'A-001' }))).toBeNull()
    expect(updateZone).toHaveBeenCalledTimes(1)
    expect(store.error).toBe('接口返回：分区更新冲突')
    expect(store.isSaving).toBe(false)
    expect(store.zones).toHaveLength(2)
  })

  it('retains the current list, applied filters and pagination when a request fails', async () => {
    const service = new FakeService()
    const useStore = createSeatPlanningStore(service, `seat-planning-${Math.random()}`)
    const store = useStore()
    await store.initialize()
    const filters = query({ gateIds: ['gate-1'] })
    await store.queryZones(filters)
    await store.setPage(2)
    const beforeIds = store.zones.map(item => item.id)

    for (const request of [
      () => store.queryZones(query({ keyword: '东看台' })),
      () => store.setPage(3),
      () => store.setPageSize(50),
    ]) {
      service.failNextZoneList = true
      expect(await request()).toBe(false)
      expect(store.zones.map(item => item.id)).toEqual(beforeIds)
      expect(store.query).toEqual(filters)
      expect(store.page).toBe(2)
      expect(store.pageSize).toBe(20)
      expect(store.total).toBe(63)
      expect(store.isLoading).toBe(false)
      expect(store.error).toBe('分区列表加载失败')
    }
  })

  it('ignores an older response that finishes after a newer query', async () => {
    const service = new FakeService()
    const store = createSeatPlanningStore(service, 'seat-query-race')()
    await store.initialize()
    let finishOlder!: (result: SeatZonePage) => void
    vi.spyOn(service, 'listZones').mockImplementationOnce(() => new Promise(resolve => { finishOlder = resolve }))
    const olderQuery = store.queryZones(query({ keyword: '东看台' }))
    expect(store.isLoading).toBe(true)
    await store.queryZones(query({ keyword: '西看台' }))
    const newerZones = store.zones.map(item => item.id)
    finishOlder({ zones: [zone(1)], total: 1, page: 1, pageSize: 20 })
    await olderQuery

    expect(store.query.keyword).toBe('西看台')
    expect(store.zones.map(item => item.id)).toEqual(newerZones)
    expect(store.total).toBe(62)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('refetches the last valid server page after deleting the only record on the final page', async () => {
    const service = new FakeService(63)
    const store = createSeatPlanningStore(service, 'seat-delete-last-page')()
    await store.initialize()
    const filters = query({ status: 'disabled' })
    await store.queryZones(filters)
    await store.setPage(2)
    expect(store.zones.map(item => item.id)).toEqual(['zone-63'])
    expect(store.total).toBe(21)

    expect(await store.removeZone('zone-63')).toBe(true)

    expect(service.listZoneCalls.slice(-2)).toEqual([[2, 20], [1, 20]])
    expect(service.listZoneQueries.slice(-2)).toEqual([filters, filters])
    expect(store.currentPage).toBe(1)
    expect(store.zones).toHaveLength(20)
    expect(store.total).toBe(20)
    expect(store.totalZoneCount('floor-2')).toBe(2)
  })

  it('refreshes the filtered page after writes without inserting nonmatching records', async () => {
    const service = new FakeService(4)
    const store = createSeatPlanningStore(service, 'seat-write-filter')()
    await store.initialize()
    const filters = query({ status: 'disabled' })
    await store.queryZones(filters)
    expect(store.zones.map(item => item.id)).toEqual(['zone-3'])

    expect(await store.updateStatus('zone-3', 'enabled')).toMatchObject({ status: 'enabled' })
    expect(store.zones).toEqual([])
    expect(store.total).toBe(0)
    expect(await store.createZone(zoneInput())).not.toBeNull()
    expect(store.zones).toEqual([])
    expect(store.total).toBe(0)
    expect(service.listZoneQueries.slice(-2)).toEqual([filters, filters])
  })

  it('exports once while a download is in flight and exposes export failures', async () => {
    const service = new FakeService(2)
    let finishExport!: (file: BackendCsvExportFile) => void
    service.exportPromise = new Promise(resolve => { finishExport = resolve })
    const useStore = createSeatPlanningStore(service, `seat-export-${Math.random()}`)
    const store = useStore()
    await store.initialize()
    await store.queryZones(query({ keyword: ' 西 ', floorId: 'floor-1', status: 'disabled', gateIds: ['gate-2'] }))

    const first = store.exportCsv()
    expect(store.isExporting).toBe(true)
    await expect(store.exportCsv()).resolves.toBeNull()
    expect(service.exportCalls).toBe(1)
    expect(service.exportQueries).toEqual([query({ keyword: '西', floorId: 'floor-1', status: 'disabled', gateIds: ['gate-2'] })])
    finishExport({
      content: new Blob(['csv']), filename: 'seat_zones.csv', truncated: false, count: null, total: null,
    })
    await expect(first).resolves.toMatchObject({ filename: 'seat_zones.csv' })
    expect(store.isExporting).toBe(false)

    service.exportPromise = null
    service.failExport = true
    await expect(store.exportCsv()).resolves.toBeNull()
    expect(store.error).toBe('分区导出失败')
  })

  it('imports once, refreshes authoritative data and preserves the applied filter', async () => {
    const service = new FakeService(4)
    service.importedZone = zone(5)
    let finishImport!: (result: SeatZoneImportResult) => void
    service.importPromise = new Promise(resolve => { finishImport = resolve })
    const useStore = createSeatPlanningStore(service, `seat-import-${Math.random()}`)
    const store = useStore()
    await store.initialize()
    await store.queryZones(query({ keyword: '东看台' }))

    const first = store.importCsv('编号,名称\nA-005,东看台 5')
    expect(store.isImporting).toBe(true)
    await expect(store.importCsv('duplicate')).resolves.toBeNull()
    expect(service.importCsvInputs).toEqual(['编号,名称\nA-005,东看台 5'])
    service.importPromise = null
    service.importedZone = zone(5)
    finishImport({ imported: 1 })

    await expect(first).resolves.toEqual({ imported: 1 })
    expect(store.isImporting).toBe(false)
    expect(store.query.keyword).toBe('东看台')
    expect(store.zones.map(item => item.id)).toContain('zone-5')
    expect(store.error).toBeNull()
  })

  it('returns the import count with a warning when the post-import refresh fails', async () => {
    const service = new FakeService(4)
    const useStore = createSeatPlanningStore(service, `seat-import-refresh-${Math.random()}`)
    const store = useStore()
    await store.initialize()
    const beforeIds = store.zones.map(item => item.id)
    service.failNextZoneList = true

    await expect(store.importCsv('编号,名称')).resolves.toEqual({ imported: 1 })
    expect(store.zones.map(item => item.id)).toEqual(beforeIds)
    expect(store.error).toBe('已成功导入 1 条座位分区，但最新列表刷新失败：分区列表加载失败')

    service.failImport = true
    await expect(store.importCsv('bad csv')).resolves.toBeNull()
    expect(store.error).toBe('分区导入失败')
  })
})
