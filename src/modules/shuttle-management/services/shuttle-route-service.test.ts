import type { SignedRequestConfig } from '@/lib/http'
import type { ShuttleRouteCreateInput, ShuttleRouteUpdateInput, ShuttleStation } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createShuttleRouteService,
  mapApiShuttleRoute,
  validateShuttleRouteCreateInput,
  validateShuttleRouteUpdateInput,
  validateShuttleStations,
} from './shuttle-route-service'
import type {
  ApiShuttleLineVO,
  ApiShuttleStopVO,
  ShuttleRouteDataRequester,
} from './shuttle-route-service'

const timestamp = '2026-08-28T10:00:00+08:00'

function apiStop(overrides: Partial<ApiShuttleStopVO> = {}): ApiShuttleStopVO {
  return {
    id: '9007199254740993',
    create_at: timestamp,
    update_at: timestamp,
    line_id: '21',
    code: null,
    name: '体育中心站',
    seq: 1,
    lng: 113.1462,
    lat: 27.8165,
    nav_address: null,
    arrival_offset_minutes: 12,
    status: 1,
    arrival_gate_ids: ['11', 12],
    ...overrides,
  }
}

function apiLine(overrides: Partial<ApiShuttleLineVO> = {}): ApiShuttleLineVO {
  return {
    id: '9007199254740995',
    create_at: timestamp,
    update_at: timestamp,
    code: 'L1',
    name: '高铁站专线',
    direction: 1,
    description: null,
    first_bus: '08:00',
    last_bus: '22:00',
    interval_minutes: 10,
    duration_minutes: 45,
    operate_status: 1,
    realtime_text: '后端实时文案',
    data_source: 'manual',
    sync_status: null,
    last_sync_at: null,
    realtime_lng: null,
    realtime_lat: null,
    realtime_eta: null,
    sort_order: 1,
    status: 1,
    stop_count: 1,
    stops: [apiStop()],
    ...overrides,
  }
}

function input(overrides: Partial<ShuttleRouteCreateInput> = {}): ShuttleRouteCreateInput {
  return {
    code: ' l1 ',
    name: ' 高铁站专线 ',
    direction: 'inbound',
    description: ' 往返体育中心 ',
    firstDeparture: '08:00',
    lastDeparture: '22:00',
    departureIntervalMinutes: 10,
    durationMinutes: 45,
    operatingStatus: 'operating',
    sortOrder: 1,
    enabled: true,
    ...overrides,
  }
}

function updateInput(overrides: Partial<ShuttleRouteUpdateInput> = {}): ShuttleRouteUpdateInput {
  const value = input(overrides)
  return {
    name: value.name,
    direction: value.direction,
    description: value.description,
    firstDeparture: value.firstDeparture,
    lastDeparture: value.lastDeparture,
    departureIntervalMinutes: value.departureIntervalMinutes,
    durationMinutes: value.durationMinutes,
    operatingStatus: value.operatingStatus,
    sortOrder: value.sortOrder,
    enabled: value.enabled,
  }
}

function station(id: string, overrides: Partial<ShuttleStation> = {}): ShuttleStation {
  return {
    id,
    name: `站点 ${id}`,
    point: { lng: 113.1462, lat: 27.8165 },
    navigationAddress: '',
    arrivalGateIds: [],
    ...overrides,
  }
}

function queuedRequester(responses: unknown[]) {
  const configs: SignedRequestConfig[] = []
  const request: ShuttleRouteDataRequester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
    configs.push(config as unknown as SignedRequestConfig)
    return responses.shift() as T
  }
  return { configs, request }
}

describe('shuttle route API mapping and validation', () => {
  it('maps current frontend fields, int64 IDs, enums, nullable text and ordered stops', () => {
    expect(mapApiShuttleRoute(apiLine({
      direction: 2,
      operate_status: 2,
      status: 0,
      stops: [
        apiStop({ id: 2, seq: 2, lng: null, lat: null, arrival_gate_ids: null }),
        apiStop({ id: 1, seq: 1, name: '首站' }),
      ],
    }))).toEqual({
      id: '9007199254740995',
      code: 'L1',
      name: '高铁站专线',
      direction: 'outbound',
      description: '',
      firstDeparture: '08:00',
      lastDeparture: '22:00',
      departureIntervalMinutes: 10,
      durationMinutes: 45,
      operatingStatus: 'partial',
      sortOrder: 1,
      enabled: false,
      stations: [
        { id: '1', name: '首站', point: { lng: 113.1462, lat: 27.8165 }, navigationAddress: '', arrivalGateIds: ['11', '12'] },
        { id: '2', name: '体育中心站', point: null, navigationAddress: '', arrivalGateIds: [] },
      ],
      coordinateSystem: 'GCJ-02',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })

  it('keeps current frontend validation rules', () => {
    expect(validateShuttleRouteCreateInput(input()).valid).toBe(true)
    expect(validateShuttleRouteUpdateInput(updateInput()).valid).toBe(true)
    expect(validateShuttleRouteCreateInput(input({ code: 'A-', lastDeparture: '07:00', departureIntervalMinutes: 4 })).issues.map(issue => issue.field))
      .toEqual(expect.arrayContaining(['code', 'schedule', 'departureIntervalMinutes']))
    expect(validateShuttleStations([]).issues[0]).toMatchObject({ field: 'stations', code: 'required' })
    expect(validateShuttleStations([station('S1', { point: null })]).issues[0]).toMatchObject({ field: 'point', code: 'required' })
    expect(validateShuttleStations(Array.from({ length: 21 }, (_, index) => station(String(index)))).issues[0]?.field).toBe('stations')
  })
})

describe('shuttle route API service', () => {
  it('loads every page and supplements every line with its latest detail', async () => {
    const { configs, request } = queuedRequester([
      { list: [apiLine({ id: 2, code: 'L2', sort_order: 2, stops: undefined })], total: 101, page: 1, page_size: 100 },
      { list: [apiLine({ id: 3, code: 'L3', sort_order: 1, stops: undefined })], total: 101, page: 2, page_size: 100 },
      apiLine({ id: 2, code: 'L2', sort_order: 2, stops: [apiStop({ id: 21 })] }),
      apiLine({ id: 3, code: 'L3', sort_order: 1, stops: [apiStop({ id: 31 })] }),
    ])
    const records = await createShuttleRouteService(request).list()

    expect(records.map(record => record.code)).toEqual(['L3', 'L2'])
    expect(records.every(record => record.stations.length === 1)).toBe(true)
    expect(configs).toMatchObject([
      { method: 'GET', url: 'api/v1/admin/shuttle/lines', params: { page: 1, page_size: 100 } },
      { method: 'GET', url: 'api/v1/admin/shuttle/lines', params: { page: 2, page_size: 100 } },
      { method: 'GET', url: 'api/v1/admin/shuttle/lines/2' },
      { method: 'GET', url: 'api/v1/admin/shuttle/lines/3' },
    ])
  })

  it('submits only current route fields and keeps the immutable code out of updates', async () => {
    const { configs, request } = queuedRequester([
      apiLine({ id: 21, stops: [] }),
      apiLine({ id: 21, stops: [apiStop({ id: 11 })] }),
      apiLine({ id: 21, name: '更新线路', stops: undefined }),
      { deleted: true },
    ])
    const service = createShuttleRouteService(request)

    await service.create(input())
    await service.update('21', updateInput({ name: '更新线路', direction: 'outbound', operatingStatus: 'suspended', enabled: false }))
    await service.remove('21')

    expect(configs[0]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/shuttle/lines',
      data: {
        code: 'L1',
        name: '高铁站专线',
        direction: 1,
        description: '往返体育中心',
        first_bus: '08:00',
        last_bus: '22:00',
        interval_minutes: 10,
        duration_minutes: 45,
        operate_status: 1,
        sort_order: 1,
        status: 1,
      },
    })
    expect(configs[0]?.data).not.toHaveProperty('realtime_text')
    expect(configs[1]).toMatchObject({ method: 'GET', url: 'api/v1/admin/shuttle/lines/21' })
    expect(configs[2]).toMatchObject({
      method: 'PATCH',
      url: 'api/v1/admin/shuttle/lines/21',
      data: { name: '更新线路', direction: 2, operate_status: 0, status: 0 },
    })
    expect(configs[2]?.data).not.toHaveProperty('code')
    expect(configs[2]?.data).not.toHaveProperty('realtime_text')
    expect(configs[3]).toMatchObject({ method: 'DELETE', url: 'api/v1/admin/shuttle/lines/21' })
  })

  it('reconciles the current station editor value through stop CRUD and reloads detail', async () => {
    const oldFirst = apiStop({ id: 11, name: '旧首站', seq: 1, arrival_gate_ids: [10] })
    const removed = apiStop({ id: 12, name: '待删除站', seq: 2 })
    const finalFirst = apiStop({ id: 11, name: '更新首站', seq: 1, arrival_gate_ids: [10, 13] })
    const created = apiStop({ id: 13, name: '新增站', seq: 2 })
    const { configs, request } = queuedRequester([
      apiLine({ id: 21, stops: [oldFirst, removed] }),
      finalFirst,
      created,
      { deleted: true },
      apiLine({ id: 21, stops: [finalFirst, created] }),
    ])
    const service = createShuttleRouteService(request)

    const saved = await service.replaceStations('21', [
      station('11', { name: '更新首站', arrivalGateIds: ['10', '13'] }),
      station('client-new', { name: '新增站' }),
    ])

    expect(saved.stations.map(item => item.id)).toEqual(['11', '13'])
    expect(configs[0]).toMatchObject({ method: 'GET', url: 'api/v1/admin/shuttle/lines/21' })
    expect(configs[1]).toMatchObject({
      method: 'PATCH',
      url: 'api/v1/admin/shuttle/stops/11',
      data: { name: '更新首站', seq: 1, arrival_gate_ids: [10, 13] },
    })
    expect(configs[1]?.data).not.toHaveProperty('arrival_offset_minutes')
    expect(configs[1]?.data).not.toHaveProperty('status')
    expect(configs[2]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/shuttle/lines/21/stops',
      data: { name: '新增站', seq: 2, status: 1 },
    })
    expect(configs[2]?.data).not.toHaveProperty('arrival_offset_minutes')
    expect(configs[3]).toMatchObject({ method: 'DELETE', url: 'api/v1/admin/shuttle/stops/12' })
    expect(configs[4]).toMatchObject({ method: 'GET', url: 'api/v1/admin/shuttle/lines/21' })
  })

  it('rejects unsafe int64 gate IDs before submitting stop changes', async () => {
    const { request } = queuedRequester([
      apiLine({ id: 21, stops: [] }),
    ])
    await expect(createShuttleRouteService(request).replaceStations('21', [
      station('client-new', { arrivalGateIds: ['9007199254740993'] }),
    ])).rejects.toThrow('超出浏览器可安全提交的范围')
  })
})
