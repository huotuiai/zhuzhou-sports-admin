import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { SeatFloor, SeatZoneWriteInput } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createSeatPlanningService,
  mapApiFloor,
  mapApiGateOption,
  mapApiZone,
  validateSeatFloorInput,
  validateSeatZoneInput,
} from './venue-seat-service'
import type {
  ApiFloorVO,
  ApiGateOptionVO,
  ApiZoneVO,
  SeatPlanningDataRequester,
  SeatPlanningFileRequester,
} from './venue-seat-service'

const timestamp = '2026-08-26T08:00:00+08:00'

function apiFloor(overrides: Partial<ApiFloorVO> = {}): ApiFloorVO {
  return {
    id: '9007199254740993', create_at: timestamp, update_at: timestamp,
    name: '一层', sort_order: 1, status: 1, zone_count: '12', ...overrides,
  }
}

function apiZone(overrides: Partial<ApiZoneVO> = {}): ApiZoneVO {
  return {
    id: '9007199254740995', create_at: timestamp, update_at: timestamp,
    code: 'A-01', name: 'A 区', floor_id: '9007199254740993', row_start: 1, row_end: 30,
    sort_order: 2, remark: null, status: 0, floor_name: '一层',
    gate_ids: ['9007199254740997', 8], gate_names: ['G-01 东检票口', 'G-02 南检票口'],
    open_gate_ids: [8], open_gate_names: ['G-02 南检票口'], ...overrides,
  }
}

function apiGate(overrides: Partial<ApiGateOptionVO> = {}): ApiGateOptionVO {
  return {
    id: '9007199254740997', code: 'G-01', name: '东检票口',
    open_status: 2, status: 0, match_open: 1, ...overrides,
  }
}

function zoneInput(overrides: Partial<SeatZoneWriteInput> = {}): SeatZoneWriteInput {
  return {
    code: ' a-01 ', name: ' A 区 ', floorId: '11', rowStart: 1, rowEnd: 30,
    gateIds: ['21', '22'], sortOrder: 2, status: 'enabled', remark: ' 主看台 ', ...overrides,
  }
}

function queuedRequester(responses: unknown[]) {
  const configs: SignedRequestConfig[] = []
  const request: SeatPlanningDataRequester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
    configs.push(config as unknown as SignedRequestConfig)
    return responses.shift() as T
  }
  return { configs, request }
}

describe('seat planning API mapping and validation', () => {
  const floors: SeatFloor[] = [{
    id: '11', name: '一层', sortOrder: 1, status: 'enabled', zoneCount: 1,
    createdAt: timestamp, updatedAt: timestamp,
  }]

  it('maps int64 IDs, statuses, counts and gate arrays without precision loss', () => {
    expect(mapApiFloor(apiFloor())).toMatchObject({
      id: '9007199254740993', status: 'enabled', zoneCount: 12,
    })
    expect(mapApiZone(apiZone())).toMatchObject({
      id: '9007199254740995', floorId: '9007199254740993', status: 'disabled', remark: '',
      gateIds: ['9007199254740997', '8'], openGateIds: ['8'],
    })
    expect(mapApiGateOption(apiGate())).toEqual({
      id: '9007199254740997', code: 'G-01', name: '东检票口',
      openStatus: 'restricted', enabled: false, matchOpen: true,
    })
  })

  it('keeps the prototype required-field and range business validation', () => {
    expect(validateSeatFloorInput({ name: ' 一层 ' }, floors).issues[0]?.code).toBe('duplicate')
    const result = validateSeatZoneInput(zoneInput({
      code: '!', floorId: 'missing', rowStart: 0, rowEnd: 0, sortOrder: 0, gateIds: [],
    }), [], floors, [{ id: '21' }])
    expect(result.issues.map(item => item.field)).toEqual([
      'code', 'floorId', 'rowStart', 'rowEnd', 'sortOrder', 'gateIds',
    ])
  })

  it('accepts a single-character numeric zone code without padding it', () => {
    const result = validateSeatZoneInput(
      zoneInput({ code: ' 1 ' }),
      [],
      floors,
      [{ id: '21' }, { id: '22' }],
    )

    expect(result).toEqual({ valid: true, issues: [] })
  })
})

describe('seat planning API service', () => {
  it('loads floors, paged zones, detail and gate options from their API endpoints', async () => {
    const { configs, request } = queuedRequester([
      [apiFloor({ id: 11 })],
      { list: [apiZone({ id: 31, floor_id: 11 })], total: '101', page: 2, page_size: 100 },
      apiZone({ id: 31, floor_id: 11 }),
      [apiGate({ id: 22, code: 'G-02', open_status: 1, status: 1 })],
    ])
    const service = createSeatPlanningService(request)

    expect(await service.listFloors()).toHaveLength(1)
    expect(await service.listZones(2, 100)).toMatchObject({ total: 101, page: 2, pageSize: 100 })
    expect((await service.getZone('31')).id).toBe('31')
    expect(await service.listGateOptions()).toMatchObject([{ id: '22', openStatus: 'open', enabled: true }])
    expect(configs).toMatchObject([
      { method: 'GET', url: 'api/v1/admin/floors' },
      { method: 'GET', url: 'api/v1/admin/zones', params: { page: 2, page_size: 100 } },
      { method: 'GET', url: 'api/v1/admin/zones/31' },
      { method: 'GET', url: 'api/v1/admin/gates/options' },
    ])
  })

  it('submits complete create data and omits the immutable code on update', async () => {
    const { configs, request } = queuedRequester([
      apiFloor({ id: 12, name: '二层', sort_order: 2, zone_count: 0 }),
      apiZone({ id: 32, floor_id: 11, status: 1, remark: '主看台', gate_ids: [21, 22] }),
      apiZone({ id: 32, floor_id: 11, code: 'A-01', name: '调整后', status: 0 }),
      { deleted: true }, { deleted: true },
    ])
    const service = createSeatPlanningService(request)

    await service.createFloor({ name: ' 二层 ', sortOrder: 2, status: 'enabled' })
    await service.createZone(zoneInput({ code: ' 1 ' }))
    await service.updateZone('32', zoneInput({ code: 'B-99', name: '调整后', status: 'disabled' }))
    await service.deleteZone('32')
    await service.deleteFloor('12')

    expect(configs[0]).toMatchObject({
      method: 'POST', url: 'api/v1/admin/floors', data: { name: '二层', sort_order: 2, status: 1 },
    })
    expect(configs[1]).toMatchObject({
      method: 'POST', url: 'api/v1/admin/zones',
      data: {
        code: '1', name: 'A 区', floor_id: 11, row_start: 1, row_end: 30,
        sort_order: 2, remark: '主看台', status: 1, gate_ids: [21, 22],
      },
    })
    expect(configs[2]?.data).not.toHaveProperty('code')
    expect(configs[2]).toMatchObject({
      method: 'PATCH', url: 'api/v1/admin/zones/32',
      data: { name: '调整后', floor_id: 11, status: 0, gate_ids: [21, 22] },
    })
    expect(configs[3]).toMatchObject({ method: 'DELETE', url: 'api/v1/admin/zones/32' })
    expect(configs[4]).toMatchObject({ method: 'DELETE', url: 'api/v1/admin/floors/12' })
  })

  it('exports the backend CSV and imports CSV text with the documented JSON body', async () => {
    const blob = new Blob(['\uFEFF编号,名称'], { type: 'text/csv;charset=utf-8' })
    let fileConfig: SignedRequestConfig | null = null
    const requestFile: SeatPlanningFileRequester = async (config) => {
      fileConfig = config
      return {
        data: blob,
        headers: { 'content-disposition': "attachment; filename*=UTF-8''seat%20zones.csv" },
      } as unknown as AxiosResponse<Blob>
    }
    const { configs, request } = queuedRequester([{ imported: '3' }])
    const service = createSeatPlanningService(request, requestFile)

    await expect(service.exportCsv()).resolves.toMatchObject({
      content: blob,
      filename: 'seat zones.csv',
    })
    await expect(service.importCsv('\uFEFF编号,名称\nA-01,A 区')).resolves.toEqual({ imported: 3 })
    expect(fileConfig).toEqual({
      method: 'GET',
      url: 'api/v1/admin/zones/export',
      responseType: 'blob',
      headers: { Accept: 'text/csv' },
    })
    expect(configs[0]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/zones/import',
      data: { csv: '\uFEFF编号,名称\nA-01,A 区' },
    })
  })

  it('rejects an invalid imported count from the backend', async () => {
    const { request } = queuedRequester([{ imported: -1 }])
    await expect(createSeatPlanningService(request).importCsv('编号,名称')).rejects.toThrow('导入数量无效')
  })

  it('rejects IDs that cannot be represented safely in a JSON number', async () => {
    const { request } = queuedRequester([])
    await expect(createSeatPlanningService(request).createZone(zoneInput({
      floorId: '9007199254740993',
    }))).rejects.toThrow('超出浏览器可安全提交的范围')
  })
})
