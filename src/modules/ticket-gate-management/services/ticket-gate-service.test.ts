import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { TicketGateWriteInput } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createTicketGateService,
  formatMapCoordinates,
  mapApiGate,
  mapApiGateFloor,
  parseMapCoordinates,
  validateTicketGateInput,
} from './ticket-gate-service'
import type {
  ApiGateFloorVO,
  ApiGateVO,
  TicketGateDataRequester,
  TicketGateFileRequester,
} from './ticket-gate-service'

const timestamp = '2026-08-26T08:00:00+08:00'

function apiGate(overrides: Partial<ApiGateVO> = {}): ApiGateVO {
  return {
    id: '9007199254740993',
    create_at: timestamp,
    update_at: timestamp,
    code: 'G-01',
    name: '东门入口',
    floor_id: '9007199254740995',
    location_desc: null,
    lng: 113.1462,
    lat: 27.8165,
    nav_address: null,
    open_status: 2,
    status_remark: '临时管制',
    sort_order: 2,
    status: 0,
    floor_name: '一层',
    zone_ids: ['9007199254740997', 8],
    zone_names: ['A-01', 'A-02'],
    match_open: 0,
    ...overrides,
  }
}

function apiFloor(overrides: Partial<ApiGateFloorVO> = {}): ApiGateFloorVO {
  return { id: '11', name: '一层', sort_order: 1, status: 1, ...overrides }
}

function input(overrides: Partial<TicketGateWriteInput> = {}): TicketGateWriteInput {
  return {
    code: ' g-01 ',
    name: ' 东门入口 ',
    floorId: '11',
    locationDescription: ' 场馆东侧主入口 ',
    mapCoordinates: '113.1462, 27.8165',
    navigationAddress: ' 株洲体育中心东门 ',
    sortOrder: 2,
    status: 'restricted',
    statusRemark: ' 临时管制 ',
    ...overrides,
  }
}

function queuedRequester(responses: unknown[]) {
  const configs: SignedRequestConfig[] = []
  const request: TicketGateDataRequester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
    configs.push(config as unknown as SignedRequestConfig)
    return responses.shift() as T
  }
  return { configs, request }
}

describe('ticket gate API mapping and validation', () => {
  it('maps int64 IDs, nullable text, the single point, statuses and covered zones', () => {
    expect(mapApiGate(apiGate())).toEqual({
      id: '9007199254740993',
      code: 'G-01',
      name: '东门入口',
      floorId: '9007199254740995',
      floorName: '一层',
      locationDescription: '',
      point: { lng: 113.1462, lat: 27.8165 },
      navigationAddress: '',
      sortOrder: 2,
      status: 'restricted',
      statusRemark: '临时管制',
      enabled: false,
      zoneIds: ['9007199254740997', '8'],
      zoneNames: ['A-01', 'A-02'],
      matchOpen: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(mapApiGateFloor(apiFloor({ status: 0 }))).toEqual({ id: '11', name: '一层', enabled: false, sortOrder: 1 })
  })

  it('keeps prototype required fields, formats coordinates and validates floor options', () => {
    const floors = [mapApiGateFloor(apiFloor())]
    expect(parseMapCoordinates('113.1, 27.8')).toEqual({ lng: 113.1, lat: 27.8 })
    expect(formatMapCoordinates({ lng: 113.1, lat: 27.8 })).toBe('113.1, 27.8')
    expect(validateTicketGateInput(input(), floors).valid).toBe(true)
    expect(validateTicketGateInput(input({ code: '!', floorId: '', mapCoordinates: '200, 27', sortOrder: 0 }), floors)
      .issues.map((issue) => issue.field)).toEqual(['code', 'floorId', 'mapCoordinates', 'sortOrder'])
  })
})

describe('ticket gate API service', () => {
  it('downloads the backend CSV with the active filters and export metadata', async () => {
    const configs: SignedRequestConfig[] = []
    const blob = new Blob(['csv'], { type: 'text/csv' })
    const requestFile: TicketGateFileRequester = async (config): Promise<AxiosResponse<Blob>> => {
      configs.push(config)
      return {
        data: blob,
        headers: {
          'content-disposition': "attachment; filename*=UTF-8''gate%20list.csv",
          'x-export-count': '12',
          'x-export-total': '12',
        },
      } as unknown as AxiosResponse<Blob>
    }
    const service = createTicketGateService(async () => { throw new Error('unexpected data request') }, requestFile)

    await expect(service.exportCsv({ keyword: ' 东 ', status: 'restricted', floorId: '11' })).resolves.toEqual({
      content: blob,
      filename: 'gate list.csv',
      truncated: false,
      count: 12,
      total: 12,
    })
    expect(configs).toEqual([{
      method: 'GET',
      url: 'api/v1/admin/gates/export',
      params: { keyword: '东', floor_id: '11', open_status: 2 },
      responseType: 'blob',
      headers: { Accept: 'text/csv' },
    }])
  })

  it('loads a filtered page, all pages, floor options and detail', async () => {
    const { configs, request } = queuedRequester([
      { list: [apiGate({ id: 1 })], total: '1', page: 2, page_size: 20 },
      { list: [apiGate({ id: 2, code: 'G-02', sort_order: 2 })], total: 101, page: 1, page_size: 100 },
      { list: [apiGate({ id: 3, code: 'G-03', sort_order: 1 })], total: 101, page: 2, page_size: 100 },
      [apiFloor()],
      apiGate({ id: 4 }),
    ])
    const service = createTicketGateService(request)
    const query = { keyword: ' 东 ', status: 'restricted' as const, floorId: '11' }

    expect(await service.listPage(2, 20, query)).toMatchObject({ total: 1, page: 2, pageSize: 20 })
    expect((await service.list()).map((gate) => gate.code)).toEqual(['G-03', 'G-02'])
    expect(await service.listFloors()).toEqual([{ id: '11', name: '一层', enabled: true, sortOrder: 1 }])
    expect((await service.get('4')).id).toBe('4')
    expect(configs).toMatchObject([
      { method: 'GET', url: 'api/v1/admin/gates', params: { page: 2, page_size: 20, keyword: '东', floor_id: '11', open_status: 2 } },
      { method: 'GET', url: 'api/v1/admin/gates', params: { page: 1, page_size: 100 } },
      { method: 'GET', url: 'api/v1/admin/gates', params: { page: 2, page_size: 100 } },
      { method: 'GET', url: 'api/v1/admin/floors' },
      { method: 'GET', url: 'api/v1/admin/gates/4' },
    ])
  })

  it('submits create/update/delete and performs detail-first minimal status updates', async () => {
    const { configs, request } = queuedRequester([
      apiGate({ id: 21, status: 1 }),
      apiGate({ id: 21, name: '东门主入口', status: 1 }),
      apiGate({ id: 21, name: '东门主入口', open_status: 1, status: 0 }),
      apiGate({ id: 21, name: '东门主入口', open_status: 0, status: 0, status_remark: '临时关闭' }),
      { deleted: true },
    ])
    const service = createTicketGateService(request)

    await service.create(input())
    await service.update('21', input({ code: 'G-99', name: '东门主入口' }))
    await service.updateStatus('21', { status: 'closed', statusRemark: ' 临时关闭 ' })
    await service.remove('21')

    expect(configs[0]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/gates',
      data: {
        code: 'G-01', name: '东门入口', floor_id: 11, location_desc: '场馆东侧主入口',
        lng: 113.1462, lat: 27.8165, nav_address: '株洲体育中心东门', open_status: 2,
        status_remark: '临时管制', sort_order: 2, status: 1,
      },
    })
    expect(configs[1]?.data).not.toHaveProperty('code')
    expect(configs[1]?.data).not.toHaveProperty('status')
    expect(configs[1]).toMatchObject({ method: 'PATCH', url: 'api/v1/admin/gates/21', data: { name: '东门主入口', floor_id: 11 } })
    expect(configs[2]).toMatchObject({ method: 'GET', url: 'api/v1/admin/gates/21' })
    expect(configs[3]).toMatchObject({
      method: 'PATCH',
      url: 'api/v1/admin/gates/21',
      data: { name: '东门主入口', lng: 113.1462, lat: 27.8165, open_status: 0, status_remark: '临时关闭' },
    })
    expect(configs[4]).toMatchObject({ method: 'DELETE', url: 'api/v1/admin/gates/21' })
  })

  it('rejects floor IDs that cannot be represented safely in JSON bodies', async () => {
    const { request } = queuedRequester([])
    await expect(createTicketGateService(request).create(input({ floorId: '9007199254740993' })))
      .rejects.toThrow('超出浏览器可安全提交的范围')
  })
})
