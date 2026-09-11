import type { SignedRequestConfig } from '@/lib/http'
import type { VrLinkWriteInput } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createVrLinkService,
  mapApiVrLink,
  mapApiVrPlaceOption,
  sanitizeVrLinkInput,
  validateVrLinkInput,
} from './vr-link-service'
import type { ApiVrLinkVO, VrLinkDataRequester } from './vr-link-service'

const timestamp = '2026-08-30T20:00:00+08:00'

function apiLink(overrides: Partial<ApiVrLinkVO> = {}): ApiVrLinkVO {
  return {
    id: '9007199254740993',
    create_at: timestamp,
    update_at: timestamp,
    title: '东门 VR 导览',
    vr_url: 'https://www.720yun.com/t/example',
    place_type: 'gate',
    place_id: '9007199254740995',
    status: 1,
    remark: null,
    place_name: '东门入口',
    place_type_label: '检票口',
    ...overrides,
  }
}

function input(overrides: Partial<VrLinkWriteInput> = {}): VrLinkWriteInput {
  return {
    title: ' 东门 VR 导览 ',
    vrUrl: ' https://www.720yun.com/t/example ',
    placeType: 'gate',
    placeId: '9007199254740995',
    status: 'enabled',
    remark: ' 主入口全景 ',
    ...overrides,
  }
}

function queuedRequester(responses: unknown[]) {
  const configs: SignedRequestConfig[] = []
  const request: VrLinkDataRequester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
    configs.push(config as unknown as SignedRequestConfig)
    return responses.shift() as T
  }
  return { configs, request }
}

describe('VR link API mapping and validation', () => {
  it.each(['gate', 'parking', 'shuttle_stop', 'seat_zone'] as const)('accepts the documented place type %s in responses and writes', (placeType) => {
    expect(mapApiVrLink(apiLink({ place_type: placeType })).placeType).toBe(placeType)
    expect(validateVrLinkInput(input({ placeType })).valid).toBe(true)
  })

  it('still rejects undocumented place types', () => {
    expect(() => mapApiVrLink(apiLink({ place_type: 'unknown' }))).toThrow('服务器返回的地点类型无效')
  })

  it('maps snake_case fields, nullable remarks, statuses and int64 IDs without precision loss', () => {
    expect(mapApiVrLink(apiLink())).toEqual({
      id: '9007199254740993',
      title: '东门 VR 导览',
      vrUrl: 'https://www.720yun.com/t/example',
      placeType: 'gate',
      placeId: '9007199254740995',
      status: 'enabled',
      remark: '',
      placeName: '东门入口',
      placeTypeLabel: '检票口',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(mapApiVrPlaceOption({ id: '9007199254740997', name: '体育馆站', extra: '内环线' })).toEqual({
      id: '9007199254740997',
      name: '体育馆站',
      extra: '内环线',
      available: true,
    })
  })

  it('normalizes values and validates required fields, limits, URL protocols and enums', () => {
    expect(sanitizeVrLinkInput(input())).toEqual({
      title: '东门 VR 导览',
      vrUrl: 'https://www.720yun.com/t/example',
      placeType: 'gate',
      placeId: '9007199254740995',
      status: 'enabled',
      remark: '主入口全景',
    })
    expect(validateVrLinkInput(input()).valid).toBe(true)
    expect(validateVrLinkInput(input({
      title: 'x'.repeat(129),
      vrUrl: 'javascript:alert(1)',
      placeId: '',
    })).issues.map(issue => issue.field)).toEqual(['title', 'vrUrl', 'placeId'])
    expect(validateVrLinkInput(input({ vrUrl: `https://example.com/${'x'.repeat(500)}` })).issues[0])
      .toMatchObject({ field: 'vrUrl', code: 'too_long' })
  })
})

describe('VR link API service', () => {
  it('loads a mixed page containing seat zones without rejecting the entire list', async () => {
    const { configs, request } = queuedRequester([{
      list: [
        apiLink(),
        apiLink({ id: '22', place_type: 'seat_zone', place_name: 'A 区', place_type_label: '座位分区' }),
      ],
      total: 2, page: 1, page_size: 20,
    }])
    const service = createVrLinkService(request)

    await expect(service.listPage(1, 20, { keyword: '', placeType: 'all', status: 'all' })).resolves.toMatchObject({
      records: [
        { placeType: 'gate' },
        { id: '22', placeType: 'seat_zone', placeName: 'A 区', placeTypeLabel: '座位分区' },
      ],
      total: 2,
    })
    expect(configs[0]?.params).toEqual({ page: 1, page_size: 20 })
  })

  it('supports seat-zone filters, options, detail, create, edit and status changes', async () => {
    const zoneLink = apiLink({ place_type: 'seat_zone', place_name: 'A 区', place_type_label: '座位分区' })
    const { configs, request } = queuedRequester([
      { list: [zoneLink], total: 1, page: 1, page_size: 20 },
      [{ id: zoneLink.place_id, name: 'A 区' }],
      zoneLink,
      zoneLink,
      zoneLink,
      { ...zoneLink, status: 0 },
    ])
    const service = createVrLinkService(request)
    const value = input({ placeType: 'seat_zone' })

    await expect(service.listPage(1, 20, { keyword: '', placeType: 'seat_zone', status: 'all' }))
      .resolves.toMatchObject({ records: [{ placeType: 'seat_zone' }], total: 1 })
    await expect(service.listPlaceOptions('seat_zone')).resolves.toEqual([
      { id: zoneLink.place_id, name: 'A 区', extra: '', available: true },
    ])
    await expect(service.get(String(zoneLink.id))).resolves.toMatchObject({ placeType: 'seat_zone' })
    await expect(service.create(value)).resolves.toMatchObject({ placeType: 'seat_zone' })
    await expect(service.update(String(zoneLink.id), value)).resolves.toMatchObject({ placeType: 'seat_zone' })
    await expect(service.updateStatus(String(zoneLink.id), 'disabled'))
      .resolves.toMatchObject({ placeType: 'seat_zone', status: 'disabled' })

    expect(configs).toMatchObject([
      { method: 'GET', url: 'api/v1/admin/vr-links', params: { page: 1, page_size: 20, place_type: 'seat_zone' } },
      { method: 'GET', url: 'api/v1/admin/vr-links/place-options', params: { place_type: 'seat_zone' } },
      { method: 'GET', url: `api/v1/admin/vr-links/${zoneLink.id}` },
      { method: 'POST', url: 'api/v1/admin/vr-links', data: { place_type: 'seat_zone', place_id: zoneLink.place_id } },
      { method: 'PATCH', url: `api/v1/admin/vr-links/${zoneLink.id}`, data: { place_type: 'seat_zone', place_id: zoneLink.place_id } },
      { method: 'PATCH', url: `api/v1/admin/vr-links/${zoneLink.id}`, data: { status: 0 } },
    ])
  })

  it('loads filtered pages, type-specific place options and detail', async () => {
    const { configs, request } = queuedRequester([
      { list: [apiLink()], total: '21', page: '2', page_size: '20' },
      [{ id: '12', name: '二号停车场' }, { id: '11', name: '一号停车场' }],
      apiLink({ id: '22' }),
    ])
    const service = createVrLinkService(request)

    await expect(service.listPage(2, 20, { keyword: ' 东门 ', placeType: 'gate', status: 'disabled' }))
      .resolves.toMatchObject({ total: 21, page: 2, pageSize: 20 })
    await expect(service.listPlaceOptions('parking')).resolves.toEqual([
      { id: '12', name: '二号停车场', extra: '', available: true },
      { id: '11', name: '一号停车场', extra: '', available: true },
    ])
    await expect(service.get('22')).resolves.toMatchObject({ id: '22' })
    expect(configs).toMatchObject([
      {
        method: 'GET',
        url: 'api/v1/admin/vr-links',
        params: { page: 2, page_size: 20, keyword: '东门', place_type: 'gate', status: 0 },
      },
      {
        method: 'GET',
        url: 'api/v1/admin/vr-links/place-options',
        params: { place_type: 'parking' },
      },
      { method: 'GET', url: 'api/v1/admin/vr-links/22' },
    ])
  })

  it('submits create, full edit, status-only patch and delete while preserving int64 strings', async () => {
    const { configs, request } = queuedRequester([
      apiLink({ id: '21' }),
      apiLink({ id: '21', title: '东门主入口 VR' }),
      apiLink({ id: '21', status: 0 }),
      { deleted: true },
    ])
    const service = createVrLinkService(request)

    await service.create(input())
    await service.update('21', input({ title: ' 东门主入口 VR ' }))
    await service.updateStatus('21', 'disabled')
    await service.remove('21')

    expect(configs[0]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/vr-links',
      data: {
        title: '东门 VR 导览',
        vr_url: 'https://www.720yun.com/t/example',
        place_type: 'gate',
        place_id: '9007199254740995',
        status: 1,
        remark: '主入口全景',
      },
    })
    expect(configs[1]).toMatchObject({
      method: 'PATCH',
      url: 'api/v1/admin/vr-links/21',
      data: { title: '东门主入口 VR', place_id: '9007199254740995' },
    })
    expect(configs[2]).toEqual({ method: 'PATCH', url: 'api/v1/admin/vr-links/21', data: { status: 0 } })
    expect(configs[3]).toEqual({ method: 'DELETE', url: 'api/v1/admin/vr-links/21' })
  })

  it('passes backend conflicts and permission errors through unchanged', async () => {
    const service = createVrLinkService(async () => {
      throw new Error('该地点已绑定 VR')
    })
    await expect(service.create(input())).rejects.toThrow('该地点已绑定 VR')
  })
})
