import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { TrafficControlType, TrafficControlWriteInput } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createTrafficControlService,
  formatControlRequestDateTime,
  mapApiControl,
  parseControlGeometry,
  serializeControlGeometry,
  trafficControlExportFilename,
  validateTrafficControlInput,
  type ApiControlPage,
  type ApiControlVO,
} from './traffic-control-service'

function apiControl(overrides: Partial<ApiControlVO> = {}): ApiControlVO {
  return {
    id: '9007199254740995',
    create_at: '2026-08-20T08:00:00+08:00',
    update_at: '2026-08-20T09:00:00+08:00',
    code: 'GZ-001',
    title: '东门道路管制',
    control_type: 'roadblock',
    area_name: '体育中心东门',
    geometry_json: JSON.stringify({
      type: 'Polygon',
      coordinates: [[[113.1, 27.8], [113.2, 27.8], [113.2, 27.9], [113.1, 27.8]]],
    }),
    start_at: '2026-08-28T10:00:00+08:00',
    end_at: '2026-08-28T12:00:00+08:00',
    detour_desc: null,
    publish_status: 'published',
    data_source: 'sync',
    sync_status: 'success',
    last_sync_at: '2026-08-20T09:00:00+08:00',
    external_id: 'external-1',
    publisher_id: '9007199254740997',
    publish_at: '2026-08-20T08:30:00+08:00',
    is_pinned: 1,
    sort_order: 10,
    remark: null,
    overlap: [{ kind: 'parking', id: '9007199254740999', name: 'P1 停车场' }],
    ...overrides,
  }
}

function page(records: ApiControlVO[], overrides: Partial<ApiControlPage> = {}): ApiControlPage {
  return { list: records, total: records.length, page: 1, page_size: 100, ...overrides }
}

function input(overrides: Partial<TrafficControlWriteInput> = {}): TrafficControlWriteInput {
  return {
    title: '东门道路管制',
    type: 'road-closure',
    areaName: '体育中心东门',
    startAt: '2027-08-28T10:00',
    endAt: '2027-08-28T12:00',
    detourInstructions: '请绕行南门',
    geometry: null,
    pinned: false,
    sortOrder: 10,
    ...overrides,
  }
}

describe('traffic control API service', () => {
  it('maps snake-case fields, int64 IDs, nullable values and overlaps', () => {
    const record = mapApiControl(apiControl())
    expect(record).toMatchObject({
      id: '9007199254740995',
      type: 'road-closure',
      detourInstructions: '',
      publisherId: '9007199254740997',
      pinned: true,
      dataSource: 'sync',
      syncStatus: 'success',
      externalId: 'external-1',
      remark: '',
      coordinateSystem: 'GCJ-02',
      overlaps: [{ kind: 'parking', id: '9007199254740999', name: 'P1 停车场' }],
    })
    expect(record.geometry).toMatchObject({ type: 'polygon' })
    expect(record.geometry?.type === 'polygon' ? record.geometry.path[0] : null).toEqual({ lng: 113.1, lat: 27.8 })
    expect(record.areaSquareMeters).toBeGreaterThan(0)
  })

  it.each([
    ['roadblock', 'road-closure'],
    ['limit', 'restriction'],
    ['detour', 'detour'],
    ['temp', 'temporary'],
    ['other', 'other'],
  ] as const)('maps API control type %s to %s', (apiType, type) => {
    expect(mapApiControl(apiControl({ control_type: apiType })).type).toBe(type)
  })

  it('parses only valid GeoJSON Polygon data', () => {
    expect(parseControlGeometry(null)).toBeNull()
    expect(() => parseControlGeometry('{broken')).toThrow('无法解析')
    expect(() => parseControlGeometry(JSON.stringify({ type: 'Point', coordinates: [113.1, 27.8] }))).toThrow('不是 GeoJSON Polygon')
  })

  it('serializes polygon, rectangle and circle as closed Polygon rings', () => {
    const polygon = JSON.parse(serializeControlGeometry({
      type: 'polygon',
      path: [{ lng: 113.1, lat: 27.8 }, { lng: 113.2, lat: 27.8 }, { lng: 113.2, lat: 27.9 }],
    })) as { type: string, coordinates: number[][][] }
    const rectangle = JSON.parse(serializeControlGeometry({
      type: 'rectangle',
      southWest: { lng: 113.1, lat: 27.8 },
      northEast: { lng: 113.2, lat: 27.9 },
    })) as { coordinates: number[][][] }
    const circle = JSON.parse(serializeControlGeometry({
      type: 'circle',
      center: { lng: 113.1, lat: 27.8 },
      radiusMeters: 100,
    })) as { coordinates: number[][][] }
    expect(polygon.type).toBe('Polygon')
    expect(polygon.coordinates[0]![0]).toEqual(polygon.coordinates[0]!.at(-1))
    expect(rectangle.coordinates[0]).toHaveLength(5)
    expect(circle.coordinates[0]).toHaveLength(49)
  })

  it('validates form values and formats local request times', () => {
    expect(validateTrafficControlInput(input()).valid).toBe(true)
    expect(validateTrafficControlInput(input({ title: 'A', areaName: '', sortOrder: -1 })).issues.map(item => item.field)).toEqual(['title', 'areaName', 'sortOrder'])
    expect(formatControlRequestDateTime('2027-08-28T10:20')).toBe('2027-08-28 10:20:00')
    expect(formatControlRequestDateTime('2027-08-28T10:20:30')).toBe('2027-08-28 10:20:30')
  })

  it('sends supported filters and automatically reads all pages', async () => {
    const configs: SignedRequestConfig[] = []
    const requester = async <T>(config: SignedRequestConfig): Promise<T> => {
      configs.push(config)
      const params = config.params as Record<string, unknown>
      const requestedPage = Number(params.page)
      const requestedPageSize = Number(params.page_size)
      return page(
        [apiControl({ id: requestedPage, code: `GZ-00${requestedPage}`, control_type: 'limit' })],
        { total: 21, page: requestedPage, page_size: requestedPageSize },
      ) as T
    }
    const service = createTrafficControlService(requester)
    const records = await service.list({ keyword: ' 东门 ', type: 'restriction', publishStatus: 'draft' }, 20)
    expect(records.map(record => record.id)).toEqual(['1', '2'])
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/controls', params: { page: 1, page_size: 20, keyword: '东门', publish_status: 'draft', control_type: 'limit' } },
      { method: 'GET', url: 'api/v1/admin/controls', params: { page: 2, page_size: 20, keyword: '东门', publish_status: 'draft', control_type: 'limit' } },
    ])
  })

  it('calls detail and mutation endpoints with documented bodies', async () => {
    const configs: SignedRequestConfig[] = []
    const responses = [
      apiControl({ id: 21 }),
      apiControl({ id: 21, publish_status: 'draft' }),
      apiControl({ id: 21, title: '东门最新管制', geometry_json: null }),
      apiControl({ id: 21, publish_status: 'published' }),
      apiControl({ id: 21, publish_status: 'revoked' }),
      { deleted: true },
    ]
    const requester = async <T>(config: SignedRequestConfig): Promise<T> => {
      configs.push(config)
      return responses.shift() as T
    }
    const service = createTrafficControlService(requester)
    await service.get('21')
    await service.create(input({ type: 'temporary' }))
    await service.update('21', input({ title: '东门最新管制' }))
    await service.publish('21')
    await service.revoke('21')
    await service.remove('21')

    expect(configs[0]).toEqual({ method: 'GET', url: 'api/v1/admin/controls/21' })
    expect(configs[1]).toMatchObject({
      method: 'POST',
      url: 'api/v1/admin/controls',
      data: {
        title: '东门道路管制', control_type: 'temp', area_name: '体育中心东门',
        start_at: '2027-08-28 10:00:00', end_at: '2027-08-28 12:00:00',
        detour_desc: '请绕行南门', is_pinned: 0, sort_order: 10,
      },
    })
    expect(configs[1]?.data).not.toHaveProperty('code')
    expect(configs[1]?.data).not.toHaveProperty('publish_at')
    expect(configs[1]?.data).not.toHaveProperty('geometry_json')
    expect(configs[2]).toMatchObject({
      method: 'PATCH',
      url: 'api/v1/admin/controls/21',
      data: { title: '东门最新管制', control_type: 'roadblock', geometry_json: null },
    })
    expect(configs[2]?.data).not.toHaveProperty('code')
    expect(configs[2]?.data).not.toHaveProperty('publish_at')
    expect(configs.slice(3)).toMatchObject([
      { method: 'POST', url: 'api/v1/admin/controls/21/publish' },
      { method: 'POST', url: 'api/v1/admin/controls/21/revoke' },
      { method: 'DELETE', url: 'api/v1/admin/controls/21' },
    ])
  })

  it('downloads the server CSV with a safe response filename', async () => {
    const blob = new Blob(['csv'], { type: 'text/csv' })
    let fileConfig: SignedRequestConfig | null = null
    const service = createTrafficControlService(
      async () => page([]) as never,
      async (config) => {
        fileConfig = config
        return { data: blob, headers: { 'content-disposition': "attachment; filename*=UTF-8''control%20zones.csv" } } as unknown as AxiosResponse<Blob>
      },
    )
    await expect(service.export()).resolves.toEqual({ content: blob, filename: 'control zones.csv' })
    expect(fileConfig).toEqual({ method: 'GET', url: 'api/v1/admin/controls/export', responseType: 'blob', headers: { Accept: 'text/csv' } })
    expect(trafficControlExportFilename('../../bad.csv')).toBe('control_zones.csv')
  })

  it('round-trips every UI type through request mapping', async () => {
    const sent: string[] = []
    const requester = async <T>(config: SignedRequestConfig): Promise<T> => {
      sent.push((config.data as { control_type: string }).control_type)
      return apiControl({ control_type: (config.data as { control_type: string }).control_type }) as T
    }
    const service = createTrafficControlService(requester)
    const types: TrafficControlType[] = ['road-closure', 'restriction', 'detour', 'temporary', 'other']
    for (const type of types) await service.create(input({ type }))
    expect(sent).toEqual(['roadblock', 'limit', 'detour', 'temp', 'other'])
  })
})
