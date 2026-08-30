import type { SignedRequestConfig } from '@/lib/http'
import type { ParkingLotCreateInput, ParkingLotUpdateInput } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createParkingLotService,
  mapApiParkingDetail,
  mapApiParkingLot,
  validateParkingLotCreateInput,
} from './parking-lot-service'
import type {
  ApiParkingVO,
  ParkingLotDataRequester,
} from './parking-lot-service'

const timestamp = '2026-08-28T10:00:00+08:00'

function apiParking(overrides: Partial<ApiParkingVO> = {}): ApiParkingVO {
  return {
    id: '9007199254740993',
    create_at: timestamp,
    update_at: timestamp,
    code: 'P-001',
    name: '中心停车场',
    location_desc: null,
    lng: 113.1462,
    lat: 27.8165,
    nav_address: null,
    capacity: 120,
    remain: 80,
    update_mode: 'manual',
    last_remain_at: null,
    is_free: 1,
    fee_desc: null,
    open_status: 1,
    recommend_weight: 50,
    sort_order: 1,
    external_code: null,
    remark: null,
    status: 1,
    direct_gates: [{ gate_id: '11', gate_name: '东门', walk_minutes: 5 }],
    ...overrides,
  }
}

function input(overrides: Partial<ParkingLotCreateInput> = {}): ParkingLotCreateInput {
  return {
    code: ' p-001 ',
    name: ' 中心停车场 ',
    locationDescription: ' 体育中心东侧 ',
    point: { lng: 113.1462, lat: 27.8165 },
    navigationAddress: ' 株洲市天元区 ',
    totalSpaces: 120,
    availabilityUpdateMethod: 'manual',
    feeType: 'free',
    feeStandard: '',
    openStatus: 'open',
    enabled: true,
    recommendationWeight: 50,
    sortOrder: 1,
    remark: '',
    ...overrides,
  }
}

function updateInput(overrides: Partial<ParkingLotUpdateInput> = {}): ParkingLotUpdateInput {
  const value = input(overrides)
  return {
    name: value.name,
    locationDescription: value.locationDescription,
    point: value.point,
    navigationAddress: value.navigationAddress,
    totalSpaces: value.totalSpaces,
    availabilityUpdateMethod: value.availabilityUpdateMethod,
    feeType: value.feeType,
    feeStandard: value.feeStandard,
    openStatus: value.openStatus,
    enabled: value.enabled,
    recommendationWeight: value.recommendationWeight,
    sortOrder: value.sortOrder,
    remark: value.remark,
  }
}

function queuedRequester(responses: unknown[]) {
  const configs: SignedRequestConfig[] = []
  const request: ParkingLotDataRequester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
    configs.push(config as unknown as SignedRequestConfig)
    return responses.shift() as T
  }
  return { configs, request }
}

describe('parking lot API mapping and validation', () => {
  it('maps current frontend fields, int64 IDs, nullable values and nearby gates', () => {
    expect(mapApiParkingLot(apiParking({
      remain: null,
      update_mode: 'sync',
      open_status: 2,
      status: 0,
      is_free: 0,
      fee_desc: '5 元/小时',
    }))).toEqual({
      id: '9007199254740993',
      code: 'P-001',
      name: '中心停车场',
      locationDescription: '',
      point: { lng: 113.1462, lat: 27.8165 },
      navigationAddress: '',
      totalSpaces: 120,
      availableSpaces: 0,
      availabilityUpdateMethod: 'integrated',
      feeType: 'paid',
      feeStandard: '5 元/小时',
      openStatus: 'closed',
      enabled: false,
      recommendationWeight: 50,
      sortOrder: 1,
      remark: '',
      coordinateSystem: 'GCJ-02',
      availabilityUpdatedAt: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(mapApiParkingDetail(apiParking()).nearbyGateBindings).toEqual([
      { gateId: '11', walkingMinutes: 5 },
    ])
  })

  it('keeps the current frontend validation rules', () => {
    expect(validateParkingLotCreateInput(input()).valid).toBe(true)
    expect(validateParkingLotCreateInput(input({ code: 'x', point: null, totalSpaces: 0 })).issues.map(issue => issue.field))
      .toEqual(['code', 'point', 'totalSpaces'])
  })
})

describe('parking lot API service', () => {
  it('loads every server page and reads the latest detail', async () => {
    const { configs, request } = queuedRequester([
      { list: [apiParking({ id: 2, code: 'P-002', sort_order: 2 })], total: 101, page: 1, page_size: 100 },
      { list: [apiParking({ id: 3, code: 'P-003', sort_order: 1 })], total: 101, page: 2, page_size: 100 },
      apiParking({ id: 4 }),
    ])
    const service = createParkingLotService(request)

    expect((await service.list()).map(record => record.code)).toEqual(['P-003', 'P-002'])
    expect((await service.get('4')).record.id).toBe('4')
    expect(configs).toMatchObject([
      { method: 'GET', url: 'api/v1/admin/parkings', params: { page: 1, page_size: 100 } },
      { method: 'GET', url: 'api/v1/admin/parkings', params: { page: 2, page_size: 100 } },
      { method: 'GET', url: 'api/v1/admin/parkings/4' },
    ])
  })

  it('forwards list filters to the parking page query', async () => {
    const { configs, request } = queuedRequester([
      { list: [apiParking({ id: 2, code: 'P-002' })], total: 1, page: 1, page_size: 20 },
    ])
    const page = await createParkingLotService(request).listPage(1, 20, {
      keyword: ' 东区 ',
      feeType: 'free',
      openStatus: 'closed',
      availabilityUpdateMethod: 'integrated',
    })

    expect(page.records.map(record => record.code)).toEqual(['P-002'])
    expect(configs).toMatchObject([{
      method: 'GET',
      url: 'api/v1/admin/parkings',
      params: { page: 1, page_size: 20, keyword: '东区', is_free: 1, open_status: 0, update_mode: 'sync' },
    }])
  })

  it('submits current create/edit fields and preserves backend-only update and control states', async () => {
    const { configs, request } = queuedRequester([
      apiParking({ id: 21 }),
      apiParking({ id: 21, update_mode: 'sync', open_status: 2 }),
      apiParking({ id: 21, capacity: 80, remain: 80, update_mode: 'sync', open_status: 2 }),
      apiParking({ id: 21 }),
      apiParking({ id: 21, status: 0 }),
      apiParking({ id: 21, remain: 12, last_remain_at: timestamp }),
      { deleted: true },
    ])
    const service = createParkingLotService(request)

    await service.create(input({ availabilityUpdateMethod: 'integrated' }), {
      nearbyGateBindings: [{ gateId: '11', walkingMinutes: 5 }],
    })
    await service.update('21', updateInput({
      totalSpaces: 80,
      availabilityUpdateMethod: 'manual',
      openStatus: 'closed',
    }), {
      clampAvailableSpaces: true,
      nearbyGateBindings: [{ gateId: '12', walkingMinutes: 8 }],
    })
    await service.updateEnabled('21', false)
    await service.updateAvailability('21', 12)
    await service.remove('21')

    expect(configs[0]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/parkings',
      data: {
        code: 'P-001',
        name: '中心停车场',
        location_desc: '体育中心东侧',
        lng: 113.1462,
        lat: 27.8165,
        nav_address: '株洲市天元区',
        capacity: 120,
        remain: 120,
        update_mode: 'manual',
        is_free: 1,
        fee_desc: '',
        open_status: 1,
        recommend_weight: 50,
        sort_order: 1,
        remark: '',
        status: 1,
        direct_gates: [{ gate_id: 11, walk_minutes: 5 }],
      },
    })
    expect(configs[1]).toMatchObject({ method: 'GET', url: 'api/v1/admin/parkings/21' })
    expect(configs[2]?.data).not.toHaveProperty('code')
    expect(configs[2]?.data).not.toHaveProperty('external_code')
    expect(configs[2]).toMatchObject({
      method: 'PATCH',
      url: 'api/v1/admin/parkings/21',
      data: {
        capacity: 80,
        remain: 80,
        update_mode: 'sync',
        open_status: 2,
        direct_gates: [{ gate_id: 12, walk_minutes: 8 }],
      },
    })
    expect(configs[3]).toMatchObject({ method: 'GET', url: 'api/v1/admin/parkings/21' })
    expect(configs[4]).toEqual(expect.objectContaining({
      method: 'PATCH',
      url: 'api/v1/admin/parkings/21',
      data: { name: '中心停车场', lng: 113.1462, lat: 27.8165, status: 0 },
    }))
    expect(configs[5]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/parkings/21/remain',
      data: { remain: 12 },
    })
    expect(configs[6]).toMatchObject({ method: 'DELETE', url: 'api/v1/admin/parkings/21' })
  })

  it('rejects unsafe int64 gate IDs before submitting JSON bodies', async () => {
    const { request } = queuedRequester([])
    await expect(createParkingLotService(request).create(input(), {
      nearbyGateBindings: [{ gateId: '9007199254740993', walkingMinutes: 5 }],
    })).rejects.toThrow('超出浏览器可安全提交的范围')
  })
})
