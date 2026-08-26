import type { ShuttleRoute, ShuttleRouteCreateInput, ShuttleRouteService, ShuttleRouteUpdateInput, ShuttleStation } from '../types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
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
    realtimeStatusText: '',
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
  async list(): Promise<ShuttleRoute[]> { return structuredClone(this.records) }
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
    store.setQuery({ keyword: 'l3', direction: 'inbound', operatingStatus: 'partial' })
    expect(store.filteredRecords.map((item) => item.id)).toEqual(['L3'])
    store.resetQuery()
    expect(store.total).toBe(3)
  })

  it('sorts by sort order, defaults to 20 rows and exposes all filtered records for maps', async () => {
    service.records = Array.from({ length: 23 }, (_, index) => route(`L${index + 1}`, { sortOrder: 22 - index }))
    const store = createShuttleRouteStore(service, 'shuttle-page')()
    await store.load()
    expect(store.filteredRecords[0]?.sortOrder).toBe(0)
    expect(store.filteredRecords).toHaveLength(23)
    expect(store.paginatedRecords).toHaveLength(20)
    store.setPage(2)
    expect(store.paginatedRecords).toHaveLength(3)
  })

  it('creates, updates, replaces stations and removes routes', async () => {
    service.records = [route('L1')]
    const store = createShuttleRouteStore(service, 'shuttle-crud')()
    await store.load()
    const input: ShuttleRouteCreateInput = {
      code: 'L2', name: '新线路', direction: 'inbound', description: '', firstDeparture: '08:00', lastDeparture: '22:00',
      departureIntervalMinutes: 10, durationMinutes: 40, operatingStatus: 'operating', realtimeStatusText: '', sortOrder: 2, enabled: true,
    }
    expect((await store.create(input))?.code).toBe('L2')
    const updated = await store.update('L1', { ...input, name: '更新线路' })
    expect(updated?.name).toBe('更新线路')
    const station: ShuttleStation = { id: 'S1', name: '体育中心', point: { lng: 113.1462, lat: 27.8165 }, navigationAddress: '', arrivalOffsetMinutes: null, arrivalGateIds: ['gate-1'] }
    expect((await store.replaceStations('L1', [station]))?.stations).toHaveLength(1)
    expect(await store.remove('L1')).toBe(true)
  })
})
