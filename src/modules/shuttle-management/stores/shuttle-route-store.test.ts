import type { ShuttleRoute, ShuttleRouteCreateInput, ShuttleRoutePage, ShuttleRouteQuery, ShuttleRouteService, ShuttleRouteUpdateInput, ShuttleStation } from '../types'
import { beforeEach, describe, expect, it } from 'vitest'
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

  private filtered(query: ShuttleRouteQuery): ShuttleRoute[] {
    const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
    return this.records.filter((item) => {
      if (keyword && ![item.code, item.name].some(value => value.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword))) return false
      if (query.direction !== 'all' && item.direction !== query.direction) return false
      if (query.operatingStatus !== 'all' && item.operatingStatus !== query.operatingStatus) return false
      return true
    })
  }

  async list(query: ShuttleRouteQuery = { keyword: '', direction: 'all', operatingStatus: 'all' }): Promise<ShuttleRoute[]> {
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
}

describe('shuttle route store', () => {
  let service: StubShuttleRouteService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubShuttleRouteService()
  })

  it('combines keyword, direction and operating-status filters', async () => {
    service.records = [
      route('L1', { name: '高铁站专线' }),
      route('L2', { name: '离场专线', direction: 'outbound' }),
      route('L3', { name: '市区环线', operatingStatus: 'partial' }),
    ]
    const store = createShuttleRouteStore(service, 'shuttle-filter')()
    await store.load()
    expect(await store.setQuery({ keyword: 'l3', direction: 'inbound', operatingStatus: 'partial' })).toBe(true)
    expect(store.records.map(item => item.id)).toEqual(['L3'])
    expect(await store.resetQuery()).toBe(true)
    expect(store.total).toBe(3)
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
    const station: ShuttleStation = { id: 'S1', name: '体育中心', point: { lng: 113.1462, lat: 27.8165 }, navigationAddress: '', arrivalGateIds: ['gate-1'] }
    expect((await store.replaceStations('L1', [station]))?.stations).toHaveLength(1)
    expect(await store.remove('L1')).toBe(true)
  })

  it('exports the active filters and resets the exporting state', async () => {
    const store = createShuttleRouteStore(service, 'shuttle-export')()
    await store.setQuery({ keyword: '高铁', direction: 'outbound', operatingStatus: 'partial' })

    await expect(store.exportCurrent()).resolves.toMatchObject({ filename: 'shuttle_lines.csv', count: 1 })
    expect(service.exportQueries).toEqual([{ keyword: '高铁', direction: 'outbound', operatingStatus: 'partial' }])
    expect(store.isExporting).toBe(false)
  })
})
