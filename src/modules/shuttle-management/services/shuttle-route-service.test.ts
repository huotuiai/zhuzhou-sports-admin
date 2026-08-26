import type { ShuttleRouteCreateInput, ShuttleRouteUpdateInput, ShuttleStation } from '../types'
import { describe, expect, it } from 'vitest'
import {
  LEGACY_SHUTTLE_ROUTE_STORAGE_KEY,
  LEGACY_SHUTTLE_POINT_STORAGE_KEY,
  LocalShuttleRouteService,
  SHUTTLE_ROUTE_STORAGE_KEY,
  validateShuttleRouteCreateInput,
  validateShuttleRouteUpdateInput,
  validateShuttleStations,
} from './shuttle-route-service'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

function createInput(overrides: Partial<ShuttleRouteCreateInput> = {}): ShuttleRouteCreateInput {
  return {
    code: 'L1',
    name: '高铁站专线',
    direction: 'inbound',
    description: '',
    firstDeparture: '08:00',
    lastDeparture: '22:00',
    departureIntervalMinutes: 10,
    durationMinutes: 45,
    operatingStatus: 'operating',
    realtimeStatusText: '',
    sortOrder: 1,
    enabled: true,
    ...overrides,
  }
}

function updateInput(overrides: Partial<ShuttleRouteUpdateInput> = {}): ShuttleRouteUpdateInput {
  const source = createInput()
  return {
    name: source.name,
    direction: source.direction,
    description: source.description,
    firstDeparture: source.firstDeparture,
    lastDeparture: source.lastDeparture,
    departureIntervalMinutes: source.departureIntervalMinutes,
    durationMinutes: source.durationMinutes,
    operatingStatus: source.operatingStatus,
    realtimeStatusText: source.realtimeStatusText,
    sortOrder: source.sortOrder,
    enabled: source.enabled,
    ...overrides,
  }
}

function station(id: string, overrides: Partial<ShuttleStation> = {}): ShuttleStation {
  return {
    id,
    name: `站点 ${id}`,
    point: { lng: 113.1462, lat: 27.8165 },
    navigationAddress: '',
    arrivalOffsetMinutes: null,
    arrivalGateIds: [],
    ...overrides,
  }
}

describe('LocalShuttleRouteService', () => {
  it('persists CRUD, keeps route codes immutable and clones station data', async () => {
    const storage = new MemoryStorage()
    let sequence = 0
    let minute = 0
    const service = new LocalShuttleRouteService({
      storage,
      createId: () => `route-${++sequence}`,
      now: () => new Date(`2026-08-18T00:${String(minute++).padStart(2, '0')}:00.000Z`),
    })
    const created = await service.create(createInput({ code: 'l1' }))
    expect(created).toMatchObject({ code: 'L1', stations: [], coordinateSystem: 'GCJ-02' })
    await expect(service.create(createInput({ code: 'L1' }))).rejects.toThrow('编号不能重复')

    const updated = await service.update(created.id, { ...updateInput({ name: '更新线路' }), code: 'CHANGED' } as ShuttleRouteUpdateInput)
    expect(updated).toMatchObject({ code: 'L1', name: '更新线路' })

    const savedStations = await service.replaceStations(created.id, [station('S1', { point: { lng: 113.1462, lat: 27.8165 }, arrivalGateIds: [' gate-1 ', 'gate-1', 'gate-2'] })])
    expect(savedStations.stations[0]?.arrivalGateIds).toEqual(['gate-1', 'gate-2'])
    savedStations.stations[0]!.name = '外部修改'
    savedStations.stations[0]!.arrivalGateIds.push('gate-3')
    expect((await service.list())[0]?.stations[0]?.name).toBe('站点 S1')
    expect((await service.list())[0]?.stations[0]?.arrivalGateIds).toEqual(['gate-1', 'gate-2'])

    await service.remove(created.id)
    expect(await service.list()).toEqual([])
  })

  it('validates route schedules, numbers, station coordinates and the station limit', () => {
    const routeResult = validateShuttleRouteCreateInput(createInput({ code: 'A-', lastDeparture: '07:00', departureIntervalMinutes: 4, durationMinutes: 0, sortOrder: -1 }))
    expect(routeResult.issues.map((item) => item.field)).toEqual(expect.arrayContaining(['code', 'schedule', 'departureIntervalMinutes', 'durationMinutes', 'sortOrder']))
    expect(validateShuttleRouteUpdateInput(updateInput()).valid).toBe(true)
    expect(validateShuttleStations([station('S1')]).valid).toBe(true)
    expect(validateShuttleStations([station('S1', { point: null })]).issues[0]).toMatchObject({ field: 'point', code: 'required' })
    expect(validateShuttleStations([station('S1', { point: { lng: 181, lat: 27 } })]).issues[0]?.field).toBe('point')
    expect(validateShuttleStations(Array.from({ length: 21 }, (_, index) => station(String(index)))).issues[0]?.field).toBe('stations')
  })

  it('uses an isolated storage key, preserves legacy data and reports corrupt records', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_SHUTTLE_POINT_STORAGE_KEY, '{"legacy":true}')
    const service = new LocalShuttleRouteService({ storage, createId: () => 'route-1' })
    expect(await service.list()).toEqual([])
    await service.create(createInput())
    expect(storage.getItem(LEGACY_SHUTTLE_POINT_STORAGE_KEY)).toBe('{"legacy":true}')
    expect(storage.getItem(SHUTTLE_ROUTE_STORAGE_KEY)).not.toBeNull()

    storage.setItem(SHUTTLE_ROUTE_STORAGE_KEY, '{invalid')
    await expect(service.list()).rejects.toThrow('本地接驳线路数据无法解析')
  })

  it('migrates v1 stations with an empty arrival-gate selection', async () => {
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_SHUTTLE_ROUTE_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      records: [{
        id: 'route-1',
        ...createInput(),
        stations: [{
          id: 'station-1',
          name: '体育中心站',
          point: { lng: 113.1462, lat: 27.8165 },
          navigationAddress: '',
          arrivalOffsetMinutes: 12,
        }],
        coordinateSystem: 'GCJ-02',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      }],
    }))
    const service = new LocalShuttleRouteService({ storage })

    expect((await service.list())[0]?.stations[0]?.arrivalGateIds).toEqual([])
    expect(JSON.parse(storage.getItem(SHUTTLE_ROUTE_STORAGE_KEY)!).schemaVersion).toBe(2)
  })
})
