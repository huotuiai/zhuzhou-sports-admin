import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { ShuttleRouteCreateInput, ShuttleRouteUpdateInput, ShuttleStation } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createShuttleRouteService,
  mapApiShuttleRoute,
  mapApiShuttleStop,
  sanitizeShuttleRouteBaseInput,
  validateShuttleRouteCreateInput,
  validateShuttleRouteUpdateInput,
  validateShuttleStations,
} from './shuttle-route-service'
import type {
  ApiShuttleLineVO,
  ApiShuttleStopVO,
  ShuttleRouteDataRequester,
  ShuttleRouteFileRequester,
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
    outboundPoint: { lng: 113.2462, lat: 27.9165 },
    outboundNavigationAddress: '',
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
        { id: '1', name: '首站', point: { lng: 113.1462, lat: 27.8165 }, navigationAddress: '', outboundPoint: { lng: 113.1462, lat: 27.8165 }, outboundNavigationAddress: '', arrivalGateIds: ['11', '12'] },
        { id: '2', name: '体育中心站', point: null, navigationAddress: '', outboundPoint: null, outboundNavigationAddress: '', arrivalGateIds: [] },
      ],
      pairLineId: null,
      stationsInherited: false,
      coordinateSystem: 'GCJ-02',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })

  it('prefers directional fields over legacy aliases and preserves an explicitly empty entry address', () => {
    expect(mapApiShuttleStop(apiStop({
      entry_lng: '113.1', entry_lat: '27.8', entry_nav_address: null,
      exit_lng: '113.2', exit_lat: '27.9', exit_nav_address: '离场导航',
      nav_address: '旧导航', vr_url: 'https://example.com/vr',
    }))).toMatchObject({
      point: { lng: 113.1, lat: 27.8 }, navigationAddress: '',
      outboundPoint: { lng: 113.2, lat: 27.9 }, outboundNavigationAddress: '离场导航',
      vrUrl: 'https://example.com/vr',
    })
  })

  it('maps a response containing only new coordinate fields and accepts zero coordinates', () => {
    expect(mapApiShuttleStop(apiStop({
      lng: undefined, lat: undefined, nav_address: undefined,
      entry_lng: 0, entry_lat: 0, entry_nav_address: '入场导航',
      exit_lng: 113.2, exit_lat: 27.9, exit_nav_address: '',
    }))).toMatchObject({
      point: { lng: 0, lat: 0 }, navigationAddress: '入场导航',
      outboundPoint: { lng: 113.2, lat: 27.9 }, outboundNavigationAddress: '',
    })
  })

  it('keeps incomplete directional coordinates visible for correction without mixing aliases', () => {
    expect(mapApiShuttleStop(apiStop({ entry_lng: 113.1, entry_lat: null, exit_lng: null, exit_lat: null })))
      .toMatchObject({ point: null, outboundPoint: null })
  })

  it.each([
    { entry_lng: 181, entry_lat: 27.8 },
    { exit_lng: 113.2, exit_lat: 91 },
    { exit_lng: 'invalid', exit_lat: 27.9 },
  ])('rejects invalid server coordinates %j', (coordinates) => {
    expect(() => mapApiShuttleStop(apiStop(coordinates))).toThrow('定位无效')
  })

  it('keeps current frontend validation rules', () => {
    expect(validateShuttleRouteCreateInput(input()).valid).toBe(true)
    expect(validateShuttleRouteUpdateInput(updateInput()).valid).toBe(true)
    expect(validateShuttleRouteCreateInput(input({ code: 'A-', lastDeparture: '07:00', departureIntervalMinutes: 4 })).issues.map(issue => issue.field))
      .toEqual(expect.arrayContaining(['code', 'schedule', 'departureIntervalMinutes']))
    expect(validateShuttleStations([]).issues[0]).toMatchObject({ field: 'stations', code: 'required' })
    expect(validateShuttleStations([station('S1', { point: null })]).issues[0]).toMatchObject({ field: 'point', code: 'required' })
    expect(validateShuttleStations(Array.from({ length: 21 }, (_, index) => station(String(index)))).issues[0]?.field).toBe('stations')
    expect(validateShuttleStations([station('S1', { outboundPoint: null })]).issues[0]).toMatchObject({ field: 'outboundPoint', code: 'required' })
    expect(validateShuttleStations([station('S1', { outboundPoint: { lng: 181, lat: 27.8 } })]).issues[0]).toMatchObject({ field: 'outboundPoint', code: 'invalid' })
  })

  it.each([
    ['14:00', '23:00'],
    ['14:00:00', '23:00:00'],
    [' 14:00:00 ', ' 23:00:00 '],
  ])('accepts and normalizes saved schedule %s–%s without re-entry', (first, last) => {
    const expected = { firstDeparture: '14:00', lastDeparture: '23:00' }
    const value = input({ firstDeparture: first, lastDeparture: last })

    expect(mapApiShuttleRoute(apiLine({ first_bus: first, last_bus: last }))).toMatchObject(expected)
    expect(sanitizeShuttleRouteBaseInput(value)).toMatchObject(expected)
    expect(validateShuttleRouteCreateInput(value).valid).toBe(true)
    expect(validateShuttleRouteUpdateInput(value).valid).toBe(true)
  })

  it.each(['', '24:00:00', '14:60:00', '14:00:60', '14:00:00invalid'])('still rejects an empty or invalid schedule value %j', (time) => {
    const result = validateShuttleRouteUpdateInput(updateInput({ firstDeparture: time, lastDeparture: time }))
    expect(result.issues.map(issue => issue.field)).toEqual(['firstDeparture', 'lastDeparture'])
  })

  it.each([
    ['23:00:00', '14:00:00'],
    ['14:00:00', '14:00'],
  ])('still rejects a non-increasing schedule %s–%s', (firstDeparture, lastDeparture) => {
    expect(validateShuttleRouteUpdateInput(updateInput({ firstDeparture, lastDeparture })).issues)
      .toEqual([{ field: 'schedule', code: 'range', message: '首班时间必须早于末班时间' }])
  })
})

describe('shuttle route API service', () => {
  it.each(['', '   ', ' https://example.com/vr?token=A%2Fb#view '])('submits and reads the station VR link including an explicit clear: %j', async (vrUrl) => {
    const { configs, request } = queuedRequester([apiLine({ stops: [apiStop({ vr_url: vrUrl.trim() })] })])
    const saved = await createShuttleRouteService(request).replaceStations('21', [station('11', { vrUrl })])
    expect(configs[0]?.data).toMatchObject({ stops: [{ vr_url: vrUrl.trim() }] })
    expect(saved.stations[0]?.vrUrl).toBe(vrUrl.trim())
  })

  it('loads complete station details and inherited line metadata', async () => {
    const { configs, request } = queuedRequester([apiLine({
      id: 22, direction: 2, pair_line_id: '9007199254740993', stops_inherited: true,
      stops: [apiStop({ seq: 2, id: 11 }), apiStop({ seq: 1, id: 12, exit_lng: 113.2, exit_lat: 27.9 })],
    })])
    const detail = await createShuttleRouteService(request).get('22')
    expect(configs).toEqual([{ method: 'GET', url: 'api/v1/admin/shuttle/lines/22' }])
    expect(detail).toMatchObject({ pairLineId: '9007199254740993', stationsInherited: true })
    expect(detail.stations.map(item => item.id)).toEqual(['12', '11'])
    expect(detail.stations[0]?.outboundPoint).toEqual({ lng: 113.2, lat: 27.9 })
  })

  it('saves an edited route with second-format API times and keeps the response editable', async () => {
    const line = apiLine({ id: 21, first_bus: '14:00:00', last_bus: '23:00:00' })
    const { configs, request } = queuedRequester([
      { list: [line], total: 1, page: 1, page_size: 20 },
      line,
      { ...line, name: '更新线路' },
    ])
    const service = createShuttleRouteService(request)
    const page = await service.listPage(1, 20)
    const edited = { ...page.records[0]!, name: '更新线路' }

    const saved = await service.update(edited.id, edited)

    expect(configs[2]).toMatchObject({
      method: 'PATCH',
      url: 'api/v1/admin/shuttle/lines/21',
      data: { name: '更新线路', first_bus: '14:00', last_bus: '23:00' },
    })
    expect(saved).toMatchObject({ name: '更新线路', firstDeparture: '14:00', lastDeparture: '23:00' })
    expect(validateShuttleRouteUpdateInput(saved).valid).toBe(true)
  })

  it('downloads the backend CSV with the active route filters', async () => {
    const configs: SignedRequestConfig[] = []
    const blob = new Blob(['csv'], { type: 'text/csv' })
    const requestFile: ShuttleRouteFileRequester = async (config): Promise<AxiosResponse<Blob>> => {
      configs.push(config)
      return {
        data: blob,
        headers: {
          'content-disposition': 'attachment; filename="shuttle.csv"',
          'x-export-truncated': 'true',
          'x-export-count': '5000',
          'x-export-total': '5100',
        },
      } as unknown as AxiosResponse<Blob>
    }
    const service = createShuttleRouteService(async () => { throw new Error('unexpected data request') }, requestFile)

    await expect(service.exportCsv({ keyword: ' 高铁 ', direction: 'outbound', operatingStatus: 'partial' })).resolves.toEqual({
      content: blob,
      filename: 'shuttle.csv',
      truncated: true,
      count: 5000,
      total: 5100,
    })
    expect(configs).toEqual([{
      method: 'GET',
      url: 'api/v1/admin/shuttle/lines/export',
      params: { keyword: '高铁', direction: 2, operate_status: 2 },
      responseType: 'blob',
      headers: { Accept: 'text/csv' },
    }])
  })

  it('loads every matching page from the list payload without extra detail requests', async () => {
    const { configs, request } = queuedRequester([
      { list: [apiLine({ id: 2, code: 'L2', sort_order: 2, stops: [apiStop({ id: 21, exit_lng: 113.2, exit_lat: 27.9, exit_nav_address: '离场导航' })] })], total: 101, page: 1, page_size: 100 },
      { list: [apiLine({ id: 3, code: 'L3', sort_order: 1, stops: [apiStop({ id: 31 })] })], total: 101, page: 2, page_size: 100 },
    ])
    const records = await createShuttleRouteService(request).list()

    expect(records.map(record => record.code)).toEqual(['L3', 'L2'])
    expect(records.every(record => record.stations.length === 1)).toBe(true)
    expect(records[1]?.stations[0]).toMatchObject({ outboundPoint: { lng: 113.2, lat: 27.9 }, outboundNavigationAddress: '离场导航' })
    expect(configs).toMatchObject([
      { method: 'GET', url: 'api/v1/admin/shuttle/lines', params: { page: 1, page_size: 100 } },
      { method: 'GET', url: 'api/v1/admin/shuttle/lines', params: { page: 2, page_size: 100 } },
    ])
  })

  it('forwards list filters to the shuttle page query', async () => {
    const { configs, request } = queuedRequester([
      { list: [apiLine({ id: 3, code: 'L3' })], total: 1, page: 1, page_size: 20 },
    ])
    const page = await createShuttleRouteService(request).listPage(1, 20, {
      keyword: ' 高铁 ',
      direction: 'outbound',
      operatingStatus: 'partial',
    })

    expect(page.records.map(record => record.code)).toEqual(['L3'])
    expect(configs).toMatchObject([{
      method: 'GET',
      url: 'api/v1/admin/shuttle/lines',
      params: { page: 1, page_size: 20, keyword: '高铁', direction: 2, operate_status: 2 },
    }])
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

  it('replaces the complete station editor value through one transactional request', async () => {
    const finalFirst = apiStop({
      id: 11, name: '更新首站', seq: 1, arrival_gate_ids: [10, 13],
      entry_lng: 113.1462, entry_lat: 27.8165, entry_nav_address: '入场导航',
      exit_lng: 113.2462, exit_lat: 27.9165, exit_nav_address: '离场导航', vr_url: 'https://example.com/vr',
    })
    const created = apiStop({ id: 13, name: '新增站', seq: 2, exit_lng: 113.2462, exit_lat: 27.9165 })
    const { configs, request } = queuedRequester([
      apiLine({ id: 21, stops: [finalFirst, created] }),
      apiLine({ id: 21, stops: [finalFirst, created] }),
    ])
    const service = createShuttleRouteService(request)

    const saved = await service.replaceStations('21', [
      station('11', { name: ' 更新首站 ', navigationAddress: ' 入场导航 ', outboundNavigationAddress: ' 离场导航 ', arrivalGateIds: ['10', '13', '10'], vrUrl: 'https://example.com/vr' }),
      station('client-new', { name: '新增站' }),
    ])

    expect(saved.stations.map(item => item.id)).toEqual(['11', '13'])
    expect(configs).toHaveLength(1)
    expect(configs[0]).toEqual({
      method: 'PUT',
      url: 'api/v1/admin/shuttle/lines/21/stops',
      data: {
        stops: [
          { name: '更新首站', seq: 1, entry_lng: 113.1462, entry_lat: 27.8165, entry_nav_address: '入场导航', exit_lng: 113.2462, exit_lat: 27.9165, exit_nav_address: '离场导航', arrival_gate_ids: ['10', '13'], vr_url: 'https://example.com/vr' },
          { name: '新增站', seq: 2, entry_lng: 113.1462, entry_lat: 27.8165, entry_nav_address: '', exit_lng: 113.2462, exit_lat: 27.9165, exit_nav_address: '', arrival_gate_ids: [] },
        ],
      },
    })
    expect(configs[0]?.data).not.toHaveProperty('idempotency_key')
    expect(saved.stations[0]).toMatchObject({
      point: { lng: 113.1462, lat: 27.8165 }, navigationAddress: '入场导航',
      outboundPoint: { lng: 113.2462, lat: 27.9165 }, outboundNavigationAddress: '离场导航',
      arrivalGateIds: ['10', '13'], vrUrl: 'https://example.com/vr',
    })
    expect((await service.get('21')).stations).toEqual(saved.stations)
  })

  it('does not submit stations missing an outbound coordinate', async () => {
    const { configs, request } = queuedRequester([])
    await expect(createShuttleRouteService(request).replaceStations('21', [station('11', { outboundPoint: null })]))
      .rejects.toThrow('请输入离场定位经纬度')
    expect(configs).toEqual([])
  })

  it('submits int64 gate IDs as strings without precision loss', async () => {
    const { configs, request } = queuedRequester([
      apiLine({ id: 21, stops: [apiStop({ arrival_gate_ids: ['9007199254740993'] })] }),
    ])
    await expect(createShuttleRouteService(request).replaceStations('21', [
      station('client-new', { arrivalGateIds: ['9007199254740993'] }),
    ])).resolves.toMatchObject({ id: '21' })
    expect(configs[0]?.data).toMatchObject({ stops: [{ arrival_gate_ids: ['9007199254740993'] }] })
  })
})
