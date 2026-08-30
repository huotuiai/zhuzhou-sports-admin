import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { GeoPoint, MapGeometry } from '@/components/map/types'
import type {
  TrafficControl,
  TrafficControlDataSource,
  TrafficControlExportFile,
  TrafficControlOverlap,
  TrafficControlPage,
  TrafficControlPublishStatus,
  TrafficControlServerQuery,
  TrafficControlService,
  TrafficControlType,
  TrafficControlValidationIssue,
  TrafficControlValidationResult,
  TrafficControlWriteInput,
} from '../types'
import {
  calculateGeometryAreaSquareMeters,
  cloneGeometry,
  geometryToPolygonPath,
  isValidGeoPoint,
  validateGeometry,
} from '@/components/map/geometry'
import { ApiError, rawHttpClient, requestData } from '@/lib/http'

type ApiControlType = 'roadblock' | 'limit' | 'detour' | 'temp' | 'other'

export interface ApiControlOverlap {
  kind: string
  id: number | string
  name: string
}

export interface ApiControlVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  title: string
  control_type: ApiControlType | string
  area_name: string
  geometry_json: string | null
  start_at: string
  end_at: string
  detour_desc: string | null
  publish_status: TrafficControlPublishStatus | string
  data_source: TrafficControlDataSource | string
  sync_status: string | null
  last_sync_at: string | null
  external_id: string | null
  publisher_id: number | string | null
  publish_at: string | null
  is_pinned: number | boolean
  sort_order: number
  remark: string | null
  overlap?: ApiControlOverlap[] | null
}

export interface ApiControlPage {
  list: ApiControlVO[]
  total: number | string
  page: number
  page_size: number
}

interface ApiControlCreateRequest {
  title: string
  control_type: ApiControlType
  area_name: string
  geometry_json?: string
  start_at: string
  end_at: string
  detour_desc: string
  is_pinned: 0 | 1
  sort_order: number
}

interface ApiControlUpdateRequest extends Omit<ApiControlCreateRequest, 'geometry_json'> {
  geometry_json: string | null
}

export interface TrafficControlDataRequester {
  <T>(config: SignedRequestConfig): Promise<T>
}

export interface TrafficControlFileRequester {
  (config: SignedRequestConfig): Promise<AxiosResponse<Blob>>
}

export class TrafficControlServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TrafficControlServiceError'
  }
}

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw responseError(`服务器返回的${field}不完整`)
  return value
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableId(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value)
}

function integer(value: unknown, fallback = 0): number {
  const result = Number(value)
  return Number.isInteger(result) ? result : fallback
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, integer(value))
}

function flag(value: unknown): boolean {
  return value === true || value === 1
}

function endpoint(path: string, id: string, suffix = ''): string {
  return `${path}/${encodeURIComponent(id)}${suffix}`
}

function mapControlType(value: unknown): TrafficControlType {
  if (value === 'roadblock') return 'road-closure'
  if (value === 'limit') return 'restriction'
  if (value === 'detour') return 'detour'
  if (value === 'temp') return 'temporary'
  if (value === 'other') return 'other'
  throw responseError('服务器返回的管制类型无效')
}

function apiControlType(value: TrafficControlType): ApiControlType {
  if (value === 'road-closure') return 'roadblock'
  if (value === 'restriction') return 'limit'
  if (value === 'temporary') return 'temp'
  return value
}

function mapPublishStatus(value: unknown): TrafficControlPublishStatus {
  if (value === 'draft' || value === 'published' || value === 'revoked') return value
  throw responseError('服务器返回的发布状态无效')
}

function mapDataSource(value: unknown): TrafficControlDataSource {
  if (value === 'manual' || value === 'sync') return value
  throw responseError('服务器返回的数据来源无效')
}

function samePoint(first: GeoPoint, second: GeoPoint): boolean {
  return Math.abs(first.lng - second.lng) <= 1e-10 && Math.abs(first.lat - second.lat) <= 1e-10
}

function geoJsonPoint(value: unknown): GeoPoint {
  if (!Array.isArray(value) || value.length < 2) throw responseError('服务器返回的管制区域 GeoJSON 不合法')
  const point = { lng: Number(value[0]), lat: Number(value[1]) }
  if (!isValidGeoPoint(point)) throw responseError('服务器返回的管制区域坐标不合法')
  return point
}

export function parseControlGeometry(value: string | null): MapGeometry | null {
  if (!value?.trim()) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value) as unknown
  }
  catch (cause) {
    throw new ApiError('服务器返回的管制区域 GeoJSON 无法解析', { kind: 'response', cause })
  }
  if (!parsed || typeof parsed !== 'object') throw responseError('服务器返回的管制区域 GeoJSON 不合法')
  const record = parsed as Record<string, unknown>
  if (record.type !== 'Polygon' || !Array.isArray(record.coordinates) || !Array.isArray(record.coordinates[0])) {
    throw responseError('服务器返回的管制区域不是 GeoJSON Polygon')
  }
  const path = (record.coordinates[0] as unknown[]).map(geoJsonPoint)
  if (path.length > 1 && samePoint(path[0]!, path[path.length - 1]!)) path.pop()
  const geometry: MapGeometry = { type: 'polygon', path }
  const validation = validateGeometry(geometry)
  if (!validation.valid) throw responseError(`服务器返回的管制区域不合法：${validation.reason ?? '未知原因'}`)
  return geometry
}

export function serializeControlGeometry(geometry: MapGeometry): string {
  const validation = validateGeometry(geometry)
  if (!validation.valid) throw new TrafficControlServiceError(validation.reason ?? '管制区域不合法')
  const path = geometryToPolygonPath(geometry, 48)
  const ring = [...path.map(point => [point.lng, point.lat]), [path[0]!.lng, path[0]!.lat]]
  return JSON.stringify({ type: 'Polygon', coordinates: [ring] })
}

function mapOverlap(value: unknown): TrafficControlOverlap[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw responseError('服务器返回的重叠提示不合法')
    const record = item as Record<string, unknown>
    if (record.id === undefined || record.id === null) throw responseError('服务器返回的重叠对象 ID 不完整')
    return {
      kind: requiredText(record.kind, '重叠对象类型'),
      id: String(record.id),
      name: requiredText(record.name, '重叠对象名称'),
    }
  })
}

function cloneRecord(record: TrafficControl): TrafficControl {
  return {
    ...record,
    geometry: record.geometry ? cloneGeometry(record.geometry) : null,
    overlaps: record.overlaps.map(item => ({ ...item })),
  }
}

export function mapApiControl(value: ApiControlVO): TrafficControl {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的交通管制 ID 不完整')
  const geometry = parseControlGeometry(value.geometry_json)
  return {
    id: String(value.id),
    code: requiredText(value.code, '交通管制编号'),
    title: requiredText(value.title, '交通管制标题'),
    type: mapControlType(value.control_type),
    areaName: requiredText(value.area_name, '交通管制区域名称'),
    startAt: requiredText(value.start_at, '交通管制开始时间'),
    endAt: requiredText(value.end_at, '交通管制结束时间'),
    detourInstructions: nullableText(value.detour_desc) ?? '',
    geometry,
    areaSquareMeters: geometry ? calculateGeometryAreaSquareMeters(geometry) : null,
    publishStatus: mapPublishStatus(value.publish_status),
    publisherId: nullableId(value.publisher_id),
    publishAt: nullableText(value.publish_at),
    pinned: flag(value.is_pinned),
    sortOrder: nonNegativeInteger(value.sort_order),
    remark: nullableText(value.remark) ?? '',
    dataSource: mapDataSource(value.data_source),
    syncStatus: nullableText(value.sync_status),
    lastSyncAt: nullableText(value.last_sync_at),
    externalId: nullableText(value.external_id),
    overlaps: mapOverlap(value.overlap),
    coordinateSystem: 'GCJ-02',
    createdAt: requiredText(value.create_at, '交通管制创建时间'),
    updatedAt: requiredText(value.update_at, '交通管制更新时间'),
  }
}

export function mapApiControlPage(value: ApiControlPage): TrafficControlPage {
  return {
    records: Array.isArray(value.list) ? value.list.map(mapApiControl) : [],
    total: nonNegativeInteger(value.total),
    page: Math.max(1, integer(value.page, 1)),
    pageSize: Math.max(1, integer(value.page_size, 20)),
  }
}

export function sortTrafficControls(records: readonly TrafficControl[]): TrafficControl[] {
  return [...records]
    .sort((first, second) => Number(second.pinned) - Number(first.pinned) || first.sortOrder - second.sortOrder || second.startAt.localeCompare(first.startAt))
    .map(cloneRecord)
}

export function sanitizeTrafficControlInput(input: TrafficControlWriteInput): TrafficControlWriteInput {
  return {
    title: normalizeText(input.title),
    type: input.type,
    areaName: normalizeText(input.areaName),
    startAt: input.startAt.trim(),
    endAt: input.endAt.trim(),
    detourInstructions: normalizeText(input.detourInstructions),
    geometry: input.geometry ? cloneGeometry(input.geometry) : null,
    pinned: Boolean(input.pinned),
    sortOrder: Number(input.sortOrder),
  }
}

export function validateTrafficControlInput(
  input: TrafficControlWriteInput,
  options: { mode?: 'create' | 'edit', now?: Date } = {},
): TrafficControlValidationResult {
  const value = sanitizeTrafficControlInput(input)
  const issues: TrafficControlValidationIssue[] = []
  const start = Date.parse(value.startAt)
  const end = Date.parse(value.endAt)

  if (!value.title) issues.push({ field: 'title', code: 'required', message: '请输入管制标题' })
  else if (value.title.length < 2 || value.title.length > 50) issues.push({ field: 'title', code: 'length', message: '标题长度须为 2–50 个字符' })
  if (!['road-closure', 'restriction', 'detour', 'temporary', 'other'].includes(value.type)) {
    issues.push({ field: 'type', code: 'invalid', message: '请选择有效的管制类型' })
  }
  if (!value.areaName) issues.push({ field: 'areaName', code: 'required', message: '请输入区域名称' })
  if (!value.startAt || !Number.isFinite(start)) issues.push({ field: 'startAt', code: 'required', message: '请选择有效的开始时间' })
  if (!value.endAt || !Number.isFinite(end)) issues.push({ field: 'endAt', code: 'required', message: '请选择有效的结束时间' })
  if (Number.isFinite(start) && Number.isFinite(end) && start >= end) issues.push({ field: 'dateRange', code: 'range', message: '开始时间必须早于结束时间' })
  if ((options.mode ?? 'create') === 'create' && Number.isFinite(end) && end <= (options.now ?? new Date()).getTime()) {
    issues.push({ field: 'endAt', code: 'range', message: '新增管制的结束时间必须晚于当前时间' })
  }
  if (!Number.isInteger(value.sortOrder) || value.sortOrder < 0) issues.push({ field: 'sortOrder', code: 'invalid', message: '排序号必须是非负整数' })
  if (value.geometry) {
    const result = validateGeometry(value.geometry)
    if (!result.valid || calculateGeometryAreaSquareMeters(value.geometry) <= 0) {
      issues.push({ field: 'geometry', code: 'invalid', message: result.reason ?? '区域面积必须大于零' })
    }
  }
  return { valid: issues.length === 0, issues }
}

export function formatControlRequestDateTime(value: string): string {
  const source = value.trim()
  const local = source.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/)
  return local ? `${local[1]} ${local[2]}:${local[3] ?? '00'}` : source
}

function requestBody(input: TrafficControlWriteInput): Omit<ApiControlCreateRequest, 'geometry_json'> {
  const value = sanitizeTrafficControlInput(input)
  return {
    title: value.title,
    control_type: apiControlType(value.type),
    area_name: value.areaName,
    start_at: formatControlRequestDateTime(value.startAt),
    end_at: formatControlRequestDateTime(value.endAt),
    detour_desc: value.detourInstructions,
    is_pinned: value.pinned ? 1 : 0,
    sort_order: value.sortOrder,
  }
}

function createBody(input: TrafficControlWriteInput): ApiControlCreateRequest {
  const value = sanitizeTrafficControlInput(input)
  return {
    ...requestBody(value),
    ...(value.geometry ? { geometry_json: serializeControlGeometry(value.geometry) } : {}),
  }
}

function updateBody(input: TrafficControlWriteInput): ApiControlUpdateRequest {
  const value = sanitizeTrafficControlInput(input)
  return {
    ...requestBody(value),
    geometry_json: value.geometry ? serializeControlGeometry(value.geometry) : null,
  }
}

function queryParameters(page: number, pageSize: number, query: TrafficControlServerQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { page, page_size: pageSize }
  const keyword = normalizeText(query.keyword)
  if (keyword) params.keyword = keyword
  if (query.publishStatus !== 'all') params.publish_status = query.publishStatus
  if (query.type !== 'all') params.control_type = apiControlType(query.type)
  return params
}

function headerValue(response: AxiosResponse, name: string): string | null {
  const direct = response.headers?.[name]
  if (typeof direct === 'string') return direct
  const headers = response.headers as { get?: (headerName: string) => unknown }
  const getter = typeof headers.get === 'function' ? headers.get(name) : null
  return typeof getter === 'string' ? getter : null
}

function safeFilename(value: string): string {
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127 ? '_' : character
  }).join('')
  return withoutControls.replace(/[\\/]/g, '_').trim() || 'control_zones.csv'
}

export function trafficControlExportFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return 'control_zones.csv'
  const encoded = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return safeFilename(decodeURIComponent(encoded.replace(/^"|"$/g, '')))
    }
    catch {
      // Fall through to the plain filename when the encoded value is malformed.
    }
  }
  const plain = contentDisposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i)
  return safeFilename((plain?.[1] ?? plain?.[2] ?? 'control_zones.csv').trim())
}

const DEFAULT_QUERY: TrafficControlServerQuery = { keyword: '', type: 'all', publishStatus: 'all' }
const MAX_PAGE_SIZE = 100
const defaultFileRequester: TrafficControlFileRequester = config => rawHttpClient.request<Blob>(config)

export function createTrafficControlService(
  request: TrafficControlDataRequester = requestData,
  requestFile: TrafficControlFileRequester = defaultFileRequester,
): TrafficControlService {
  const service: TrafficControlService = {
    async listPage(page, pageSize, query) {
      return mapApiControlPage(await request<ApiControlPage>({
        method: 'GET',
        url: 'api/v1/admin/controls',
        params: queryParameters(page, pageSize, query),
      }))
    },

    async list(query = DEFAULT_QUERY, pageSize = MAX_PAGE_SIZE) {
      const requestPageSize = Math.max(1, Math.trunc(pageSize) || MAX_PAGE_SIZE)
      const first = await service.listPage(1, requestPageSize, query)
      const records = [...first.records]
      const pageCount = Math.ceil(first.total / Math.max(1, first.pageSize))
      for (let page = 2; page <= pageCount; page += 1) {
        records.push(...(await service.listPage(page, requestPageSize, query)).records)
      }
      return sortTrafficControls([...new Map(records.map(record => [record.id, record])).values()])
    },

    async get(id) {
      return mapApiControl(await request<ApiControlVO>({ method: 'GET', url: endpoint('api/v1/admin/controls', id) }))
    },

    async create(input) {
      const validation = validateTrafficControlInput(input, { mode: 'create' })
      if (!validation.valid) throw new TrafficControlServiceError(validation.issues[0]!.message)
      const data = createBody(input)
      return mapApiControl(await request<ApiControlVO>({ method: 'POST', url: 'api/v1/admin/controls', data }))
    },

    async update(id, input) {
      const validation = validateTrafficControlInput(input, { mode: 'edit' })
      if (!validation.valid) throw new TrafficControlServiceError(validation.issues[0]!.message)
      const data = updateBody(input)
      return mapApiControl(await request<ApiControlVO>({
        method: 'PATCH',
        url: endpoint('api/v1/admin/controls', id),
        data,
      }))
    },

    async remove(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/controls', id) })
    },

    async publish(id) {
      return mapApiControl(await request<ApiControlVO>({
        method: 'POST',
        url: endpoint('api/v1/admin/controls', id, '/publish'),
      }))
    },

    async revoke(id) {
      return mapApiControl(await request<ApiControlVO>({
        method: 'POST',
        url: endpoint('api/v1/admin/controls', id, '/revoke'),
      }))
    },

    async export(): Promise<TrafficControlExportFile> {
      const response = await requestFile({
        method: 'GET',
        url: 'api/v1/admin/controls/export',
        responseType: 'blob',
        headers: { Accept: 'text/csv' },
      })
      return {
        content: response.data,
        filename: trafficControlExportFilename(headerValue(response, 'content-disposition')),
      }
    },
  }

  return service
}

export const trafficControlService = createTrafficControlService()
