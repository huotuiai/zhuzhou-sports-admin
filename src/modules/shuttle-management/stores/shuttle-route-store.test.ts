import type { ShuttleRoadRoutesResult, ShuttleRoute, ShuttleRouteCreateInput, ShuttleRoutePage, ShuttleRouteQuery, ShuttleRouteService, ShuttleRouteUpdateInput, ShuttleStation } from '../types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { BackendCsvExportFile } from '@/lib/http'
import { createShuttleRouteStore } from './shuttle-route-store'

function route(id: string, overrides: Partial<ShuttleRoute> = {}): ShuttleRoute {
  return {
    id,
    code: id,
    name: `线路 ${id}`,
    direction: 'inbound',
    description: '',
    firstDeparture: '08:00',
    lastDeparture: '22:00',
    departureIntervalMinutes: 10,
    durationMinutes: 45,
    operatingStatus: 'operating',
    sortOrder: 0,
    enabled: true,
    stations: [],
    coordinateSystem: 'GCJ-02',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  }
}

class StubShuttleRouteService implements ShuttleRouteService {
  records: ShuttleRoute[] = []
  exportQueries: ShuttleRouteQuery[] = []

  async get(id: string): Promise<ShuttleRoute> {
    const record = this.records.find(item => item.id === id)
    if (!record) throw new Error('线路不存在')
    return structuredClone(record)
  }

  private filtered(query: ShuttleRouteQuery): ShuttleRoute[] {
    const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
    return this.records.filter((item) => {
      if (keyword && ![item.code, item.name].some(value => value.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword))) return false
      if (query.direction !== 'all' && item.direction !== query.direction) return false
      if (query.operatingStatus !== 'all' && item.operatingStatus !== query.operatingStatus) return false
      if (query.status !== 'all' && item.enabled !== (query.status === 'enabled')) return false
      return true
    })
  }

  async list(query: ShuttleRouteQuery = { keyword: '', direction: 'all', operatingStatus: 'all', status: 'all' }): Promise<ShuttleRoute[]> {
    return structuredClone(this.filtered(query))
  }

  async listPage(page: number, pageSize: number, query: ShuttleRouteQuery): Promise<ShuttleRoutePage> {
    const records = this.filtered(query)
    const start = (page - 1) * pageSize
    return { records: structuredClone(records.slice(start, start + pageSize)), total: records.length, page, pageSize }
  }

  async exportCsv(query: ShuttleRouteQuery): Promise<BackendCsvExportFile> {
    this.exportQueries.push({ ...query })
    return { content: new Blob(['csv']), filename: 'shuttle_lines.csv', truncated: false, count: 1, total: 1 }
  }
  async create(input: ShuttleRouteCreateInput): Promise<ShuttleRoute> {
    const record = route(`route-${this.records.length + 1}`, { ...input, code: input.code })
    this.records.push(record)
    return structuredClone(record)
  }
  async update(id: string, input: ShuttleRouteUpdateInput): Promise<ShuttleRoute> {
    const index = this.records.findIndex((item) => item.id === id)
    const record = { ...this.records[index]!, ...input }
    this.records[index] = record
    return structuredClone(record)
  }
  async replaceStations(id: string, stations: readonly ShuttleStation[]): Promise<ShuttleRoute> {
    const index = this.records.findIndex((item) => item.id === id)
    const record = { ...this.records[index]!, stations: structuredClone([...stations]) }
    this.records[index] = record
    return structuredClone(record)
  }
  async remove(id: string): Promise<void> { this.records = this.records.filter((item) => item.id !== id) }
  async saveRoadRoutes(id: string): Promise<ShuttleRoadRoutesResult> { return { lineId: id, routes: [] } }
}

describe('shuttle route store', () => {
  let service: StubShuttleRouteService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubShuttleRouteService()
  })

  it('combines keyword, direction, operating-status and enabled-status filters', async () => {
    service.records = [
      route('L1', { name: '高铁站专线' }),
      route('L2', { name: '离场专线', direction: 'outbound' }),
      route('L3', { name: '市区环线', operatingStatus: 'partial', enabled: false }),
    ]
    const store = createShuttleRouteStore(service, 'shuttle-filter')()
    await store.load()
    expect(await store.setQuery({ keyword: 'l3', direction: 'inbound', operatingStatus: 'partial', status: 'disabled' })).toBe(true)
    expect(store.records.map(item => item.id)).toEqual(['L3'])
    expect(await store.resetQuery()).toBe(true)
    expect(store.query).toEqual({ keyword: '', direction: 'all', operatingStatus: 'all', status: 'all' })
    expect(store.total).toBe(3)
  })

  it('uses backend list and map results without filtering records locally', async () => {
    const records = [route('L1', { roadRoutes: [] }), route('L2', { enabled: false, roadRoutes: [] })]
    const listPage = vi.spyOn(service, 'listPage').mockResolvedValue({ records, total: 42, page: 1, pageSize: 20 })
    const list = vi.spyOn(service, 'list').mockResolvedValue(records)
    const store = createShuttleRouteStore(service, 'shuttle-backend-filters')()
    const query: ShuttleRouteQuery = { keyword: '', direction: 'all', operatingStatus: 'all', status: 'disabled' }

    expect(await store.setQuery(query)).toBe(true)
    expect(listPage).toHaveBeenCalledWith(1, 20, query)
    expect(store.filteredRecords).toEqual(records)
    expect(store.paginatedRecords).toEqual(records)
    expect(store.total).toBe(42)
    expect(await store.loadMap()).toBe(true)
    expect(list).toHaveBeenCalledWith(query)
    expect(store.mapRecords).toEqual(records)
  })

  it('paginates on the server and exposes all matching records for maps', async () => {
    service.records = Array.from({ length: 23 }, (_, index) => route(`L${index + 1}`, { sortOrder: 22 - index }))
    const store = createShuttleRouteStore(service, 'shuttle-page')()
    await store.load()
    expect(store.paginatedRecords).toHaveLength(20)
    expect(store.total).toBe(23)
    expect(await store.setPage(2)).toBe(true)
    expect(store.paginatedRecords).toHaveLength(3)
    expect(await store.loadMap()).toBe(true)
    expect(store.mapRecords).toHaveLength(23)
  })

  it('creates, updates, replaces stations and removes routes', async () => {
    service.records = [route('L1')]
    const store = createShuttleRouteStore(service, 'shuttle-crud')()
    await store.load()
    const input: ShuttleRouteCreateInput = {
      code: 'L2', name: '新线路', direction: 'inbound', description: '', firstDeparture: '08:00', lastDeparture: '22:00',
      departureIntervalMinutes: 10, durationMinutes: 40, operatingStatus: 'operating', sortOrder: 2, enabled: true,
    }
    expect((await store.create(input))?.code).toBe('L2')
    const updated = await store.update('L1', { ...input, name: '更新线路' })
    expect(updated?.name).toBe('更新线路')
    const station: ShuttleStation = {
      id: 'S1', name: '体育中心', point: { lng: 113.1462, lat: 27.8165 }, navigationAddress: '入场导航',
      outboundPoint: { lng: 113.2462, lat: 27.9165 }, outboundNavigationAddress: '离场导航', arrivalGateIds: ['gate-1'],
      vrUrl: 'https://example.com/vr',
    }
    expect((await store.replaceStations('L1', [station]))?.stations).toEqual([station])
    expect(store.records.find(item => item.id === 'L1')?.stations).toEqual([station])
    expect(await store.remove('L1')).toBe(true)
  })

  it('opens station details instead of the lightweight list data', async () => {
    service.records = [route('L1')]
    const store = createShuttleRouteStore(service, 'shuttle-station-detail')()
    await store.load()
    const detail = route('L1', { stations: [{
      id: 'S1', name: '首站', point: { lng: 113.1, lat: 27.8 }, navigationAddress: '入场导航',
      outboundPoint: { lng: 113.2, lat: 27.9 }, outboundNavigationAddress: '离场导航', arrivalGateIds: ['11'],
    }] })
    service.records = [detail]
    expect(await store.loadStationRoute('L1')).toEqual(detail)
    expect(store.records[0]?.stations).toEqual([])
  })

  it('resolves inherited stations to the paired inbound line even when it is outside the current page', async () => {
    const inbound = route('L1')
    service.records = [inbound, route('L2', { direction: 'outbound', pairLineId: 'L1', stationsInherited: true })]
    const get = vi.spyOn(service, 'get')
    const store = createShuttleRouteStore(service, 'shuttle-inherited-stations')()
    expect(await store.loadStationRoute('L2')).toEqual(inbound)
    expect(get.mock.calls).toEqual([['L2'], ['L1']])
  })

  it('does not open a writable station editor if loading the paired inbound line fails', async () => {
    service.records = [route('L2', { direction: 'outbound', pairLineId: 'L1', stationsInherited: true })]
    const store = createShuttleRouteStore(service, 'shuttle-inherited-stations-error')()
    expect(await store.loadStationRoute('L2')).toBeNull()
    expect(store.error).toBe('线路不存在')
  })

  it('retains the caller draft and saved stations when saving fails', async () => {
    const station: ShuttleStation = {
      id: 'S1', name: '首站', point: { lng: 113.1, lat: 27.8 }, navigationAddress: '',
      outboundPoint: { lng: 113.2, lat: 27.9 }, outboundNavigationAddress: '', arrivalGateIds: [],
    }
    service.records = [route('L1', { stations: [station] })]
    const store = createShuttleRouteStore(service, 'shuttle-station-save-error')()
    await store.load()
    const draft = [{ ...station, outboundNavigationAddress: ' 修改离场导航 ' }]
    vi.spyOn(service, 'replaceStations').mockRejectedValue(new Error('保存失败'))
    const saveRoads = vi.spyOn(service, 'saveRoadRoutes')
    expect(await store.replaceStations('L1', draft)).toBeNull()
    expect(store.error).toBe('保存失败')
    expect(store.isSaving).toBe(false)
    expect(draft[0]?.outboundNavigationAddress).toBe(' 修改离场导航 ')
    expect(store.records[0]?.stations).toEqual([station])
    expect(saveRoads).not.toHaveBeenCalled()
  })

  it('shows the backend conflict regardless of which page or filter contains the matching code', async () => {
    service.records = Array.from({ length: 21 }, (_, index) => route(`L${index + 1}`))
    const write = vi.spyOn(service, 'create').mockRejectedValue(new Error('接口返回：线路编号冲突'))
    const store = createShuttleRouteStore(service, 'shuttle-code-conflict')()
    await store.load()
    const input: ShuttleRouteCreateInput = {
      code: 'L1', name: '新线路', direction: 'inbound', description: '', firstDeparture: '08:00', lastDeparture: '22:00',
      departureIntervalMinutes: 10, durationMinutes: 40, operatingStatus: 'operating', sortOrder: 2, enabled: true,
    }
    const submit = async () => {
      expect(store.validateCreate(input).valid).toBe(true)
      expect(await store.create(input)).toBeNull()
      expect(store.error).toBe('接口返回：线路编号冲突')
      expect(store.isSaving).toBe(false)
    }
    await submit()
    await store.setPage(2)
    await submit()
    await store.setQuery({ keyword: '不存在' })
    await submit()
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('exports the active filters and resets the exporting state', async () => {
    const store = createShuttleRouteStore(service, 'shuttle-export')()
    await store.setQuery({ keyword: '高铁', direction: 'outbound', operatingStatus: 'partial', status: 'disabled' })

    await expect(store.exportCurrent()).resolves.toMatchObject({ filename: 'shuttle_lines.csv', count: 1 })
    expect(service.exportQueries).toEqual([{ keyword: '高铁', direction: 'outbound', operatingStatus: 'partial', status: 'disabled' }])
    expect(store.isExporting).toBe(false)
  })
})

describe('shuttle road route workflow', () => {
  const stations: ShuttleStation[] = [1, 2].map(index => ({
    id: `S${index}`, name: `站点 ${index}`, point: { lng: 113 + index / 10, lat: 27.8 }, navigationAddress: '',
    outboundPoint: { lng: 113 + index / 10, lat: 27.9 }, arrivalGateIds: [],
  }))
  const roads: ShuttleRoadRoutesResult['routes'] = ['inbound', 'outbound'].map(direction => ({
    direction: direction as 'inbound' | 'outbound', path: [{ lng: 113.1, lat: 27.8 }, { lng: 113.2, lat: 27.9 }],
    distance: 3000, duration: 500, enabled: true, lastError: '',
  }))

  beforeEach(() => setActivePinia(createPinia()))

  it('awaits station commit before planning, holds the saving state and prevents duplicate writes', async () => {
    const service = new StubShuttleRouteService()
    service.records = [route('L1')]
    let resolveSave!: (value: ShuttleRoute) => void
    const replace = vi.spyOn(service, 'replaceStations').mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
    let resolveRoads!: (value: ShuttleRoadRoutesResult) => void
    const saveRoads = vi.spyOn(service, 'saveRoadRoutes').mockImplementation(() => new Promise(resolve => { resolveRoads = resolve }))
    const store = createShuttleRouteStore(service, 'roads-order')()
    const pending = store.replaceStations('L1', stations)
    expect(store.isSaving).toBe(true)
    expect(saveRoads).not.toHaveBeenCalled()
    expect(await store.replaceStations('L1', stations)).toBeNull()
    expect(replace).toHaveBeenCalledTimes(1)
    resolveSave(route('L1', { stations }))
    await Promise.resolve()
    expect(saveRoads).toHaveBeenCalledExactlyOnceWith('L1')
    expect(store.savingRoadRoutesId).toBe('L1')
    expect(await store.saveRoadRoutes('L1')).toBe(false)
    resolveRoads({ lineId: 'L1', routes: roads })
    expect((await pending)?.roadRoutes).toEqual(roads)
    expect(store.isMutating).toBe(false)
  })

  it('keeps saved stations after planning failure and retries only the road endpoint', async () => {
    const service = new StubShuttleRouteService()
    service.records = [route('L1', { stations, roadRoutes: roads })]
    const saveRoads = vi.spyOn(service, 'saveRoadRoutes')
      .mockRejectedValueOnce(new Error('未配置高德 Key'))
      .mockResolvedValueOnce({ lineId: 'L1', routes: roads })
    const replace = vi.spyOn(service, 'replaceStations')
    const store = createShuttleRouteStore(service, 'roads-retry')()
    await store.load()
    await store.loadMap()
    const saved = await store.replaceStations('L1', [{ ...stations[0]!, name: '新站名' }, stations[1]!])
    expect(saved?.stations[0]?.name).toBe('新站名')
    expect(store.records[0]?.stations[0]?.name).toBe('新站名')
    expect(store.mapRecords[0]?.stations[0]?.name).toBe('新站名')
    expect(store.roadRouteWarnings.L1).toContain('未配置高德 Key')
    expect(store.error).toBeNull()
    expect(store.isMutating).toBe(false)
    expect(store.mapRecords[0]?.roadRoutes).toEqual([])
    await store.loadMap()
    expect(store.mapRecords[0]?.roadRoutes).toEqual([])
    expect(await store.saveRoadRoutes('L1')).toBe(true)
    expect(store.mapRecords[0]?.roadRoutes).toEqual(roads)
    expect(store.roadRouteWarnings).toEqual({})
    expect(replace).toHaveBeenCalledTimes(1)
    expect(saveRoads).toHaveBeenCalledTimes(2)
  })

  it('still calls planning after deletion leaves one station, so the backend can clear stale paths', async () => {
    const service = new StubShuttleRouteService()
    service.records = [route('L1', { stations, roadRoutes: roads })]
    const saveRoads = vi.spyOn(service, 'saveRoadRoutes').mockRejectedValue(new Error('启用站点不足 2 个'))
    const store = createShuttleRouteStore(service, 'roads-one-stop')()
    expect((await store.replaceStations('L1', [stations[0]!]))?.stations).toHaveLength(1)
    expect(saveRoads).toHaveBeenCalledExactlyOnceWith('L1')
    expect(store.roadRouteWarnings.L1).toContain('不足 2 个')
  })

  it('hydrates lightweight map results with detail routes, but leaves list pagination lightweight', async () => {
    const service = new StubShuttleRouteService()
    service.records = [route('L1', { stations }), route('L2', { stations, roadRoutes: [] })]
    const get = vi.spyOn(service, 'get').mockResolvedValue(route('L1', { stations, roadRoutes: roads }))
    const store = createShuttleRouteStore(service, 'roads-map-detail')()
    await store.load()
    expect(get).not.toHaveBeenCalled()
    await store.loadMap()
    expect(get).toHaveBeenCalledExactlyOnceWith('L1')
    expect(store.mapRecords[0]?.roadRoutes).toEqual(roads)
  })

  it('updates cached paths for the requested, actual and explicitly inherited lines', async () => {
    const service = new StubShuttleRouteService()
    service.records = [route('L1', { roadRoutes: [] }), route('L2', { roadRoutes: [], stationsInherited: true, pairLineId: 'L1' })]
    vi.spyOn(service, 'saveRoadRoutes').mockResolvedValue({ lineId: 'L1', routes: roads })
    const store = createShuttleRouteStore(service, 'roads-actual-line')()
    await store.load()
    await store.loadMap()
    expect(await store.saveRoadRoutes('L2')).toBe(true)
    expect(store.records.every(record => record.roadRoutes?.length === 2)).toBe(true)
    expect(store.mapRecords.every(record => record.roadRoutes?.length === 2)).toBe(true)
  })

  it('reports invalid or incomplete planning results rather than claiming success', async () => {
    const service = new StubShuttleRouteService()
    vi.spyOn(service, 'saveRoadRoutes')
      .mockResolvedValueOnce({ lineId: 'L1', routes: [{ ...roads[0]!, enabled: false, lastError: '规划失败' }] })
      .mockResolvedValueOnce({ lineId: 'L1', routes: [roads[0]!] })
    const store = createShuttleRouteStore(service, 'roads-invalid')()
    expect(await store.saveRoadRoutes('L1')).toBe(false)
    expect(store.roadRouteWarnings.L1).toContain('规划失败')
    expect(await store.saveRoadRoutes('L1')).toBe(false)
    expect(store.roadRouteWarnings.L1).toContain('未返回完整')
  })

  it('does not plan on line metadata updates or whole-line deletion', async () => {
    const service = new StubShuttleRouteService()
    service.records = [route('L1')]
    const saveRoads = vi.spyOn(service, 'saveRoadRoutes')
    const store = createShuttleRouteStore(service, 'roads-base-only')()
    await store.update('L1', route('L1', { name: '新名称' }))
    await store.remove('L1')
    expect(saveRoads).not.toHaveBeenCalled()
  })
})
