import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type {
  GeoPoint,
  TicketGate,
  TicketGateFloorOption,
  TicketGatePage,
  TicketGateQuery,
  TicketGateService,
  TicketGateStatus,
  TicketGateValidationIssue,
  TicketGateValidationResult,
  TicketGateWriteInput,
} from '../types'
import { ApiError, mapCsvExportResponse, rawHttpClient, requestData } from '@/lib/http'

export interface ApiGateVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  name: string
  floor_id: number | string
  location_desc: string | null
  lng: number
  lat: number
  nav_address: string | null
  open_status: number
  status_remark: string | null
  sort_order: number
  status: number
  floor_name: string
  zone_ids: Array<number | string>
  zone_names: string[]
  match_open: boolean | number
}

export interface ApiGatePage {
  list: ApiGateVO[]
  total: number | string
  page: number
  page_size: number
}

export interface ApiGateFloorVO {
  id: number | string
  name: string
  sort_order: number
  status: number
}

interface ApiGateCreateRequest {
  code: string
  name: string
  floor_id: number
  location_desc: string
  lng: number
  lat: number
  nav_address: string
  open_status: 0 | 1 | 2
  status_remark: string
  sort_order: number
  status: 1
}

type ApiGateUpdateRequest = Omit<ApiGateCreateRequest, 'code' | 'status'>

interface ApiGateStatusRequest {
  name: string
  lng: number
  lat: number
  open_status: 0 | 1 | 2
  status_remark: string
}

export interface TicketGateDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

export interface TicketGateFileRequester {
  (config: SignedRequestConfig): Promise<AxiosResponse<Blob>>
}

export class TicketGateServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TicketGateServiceError'
  }
}

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function identity(value: string): string {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw responseError(`服务器返回的${field}不完整`)
  return value
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

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function isFinitePoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return typeof point.lng === 'number' && Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180 &&
    typeof point.lat === 'number' && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
}

function isStatus(value: unknown): value is TicketGateStatus {
  return value === 'open' || value === 'closed' || value === 'restricted'
}

function mapOpenStatus(value: unknown): TicketGateStatus {
  if (integer(value, 1) === 0) return 'closed'
  if (integer(value, 1) === 2) return 'restricted'
  return 'open'
}

function apiOpenStatus(value: TicketGateStatus): 0 | 1 | 2 {
  if (value === 'closed') return 0
  if (value === 'restricted') return 2
  return 1
}

function bodyId(value: string): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new ApiError('接口 ID 超出浏览器可安全提交的范围', { kind: 'configuration' })
  }
  return result
}

function endpoint(path: string, id: string): string {
  return `${path}/${encodeURIComponent(id)}`
}

function cloneGate(record: TicketGate): TicketGate {
  return {
    ...record,
    point: { ...record.point },
    zoneIds: [...record.zoneIds],
    zoneNames: [...record.zoneNames],
  }
}

export function parseMapCoordinates(value: string): GeoPoint {
  const source = value.trim()
  const coordinateParts = source.split(',').map((item) => item.trim())
  const point = { lng: Number(coordinateParts[0]), lat: Number(coordinateParts[1]) }
  if (coordinateParts.length !== 2 || coordinateParts.some((item) => !item) || !isFinitePoint(point)) {
    throw new TicketGateServiceError('定位格式应为“经度, 纬度”')
  }
  return point
}

export function formatMapCoordinates(point: GeoPoint): string {
  return `${point.lng}, ${point.lat}`
}

export function sanitizeTicketGateInput(input: TicketGateWriteInput): TicketGateWriteInput {
  return {
    code: normalizeText(input.code).toUpperCase(),
    name: normalizeText(input.name),
    floorId: normalizeText(input.floorId),
    locationDescription: normalizeText(input.locationDescription),
    mapCoordinates: input.mapCoordinates.trim(),
    navigationAddress: normalizeText(input.navigationAddress),
    sortOrder: Number(input.sortOrder),
    status: input.status,
    statusRemark: input.status === 'open' ? '' : normalizeText(input.statusRemark),
  }
}

export function validateTicketGateInput(
  input: TicketGateWriteInput,
  floors: readonly TicketGateFloorOption[] = [],
  records: readonly TicketGate[] = [],
  excludedId?: string,
): TicketGateValidationResult {
  const value = sanitizeTicketGateInput(input)
  const issues: TicketGateValidationIssue[] = []

  if (!value.code) issues.push({ field: 'code', code: 'required', message: '请输入检票口编号' })
  else if (!/^[A-Z0-9-]{2,10}$/.test(value.code)) {
    issues.push({ field: 'code', code: 'invalid', message: '编号须为 2–10 位字母、数字或连字符' })
  }
  else if (records.some((item) => item.id !== excludedId && identity(item.code) === identity(value.code))) {
    issues.push({ field: 'code', code: 'duplicate', message: '检票口编号不能重复' })
  }

  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入检票口名称' })
  else if (records.some((item) => item.id !== excludedId && identity(item.name) === identity(value.name))) {
    issues.push({ field: 'name', code: 'duplicate', message: '检票口名称不能重复' })
  }

  if (!value.floorId) issues.push({ field: 'floorId', code: 'required', message: '请选择楼层' })
  else if (floors.length && !floors.some((item) => item.id === value.floorId)) {
    issues.push({ field: 'floorId', code: 'invalid', message: '请选择有效楼层' })
  }

  if (!value.mapCoordinates) {
    issues.push({ field: 'mapCoordinates', code: 'required', message: '请输入定位（经纬度）' })
  }
  else {
    try {
      parseMapCoordinates(value.mapCoordinates)
    }
    catch {
      issues.push({ field: 'mapCoordinates', code: 'invalid', message: '定位格式应为“经度, 纬度”' })
    }
  }

  if (!Number.isInteger(value.sortOrder) || value.sortOrder <= 0) {
    issues.push({ field: 'sortOrder', code: 'positive_integer', message: '排序号必须是大于 0 的整数' })
  }
  if (!isStatus(value.status)) issues.push({ field: 'status', code: 'invalid', message: '请选择有效的检票口状态' })

  return { valid: issues.length === 0, issues }
}

export function mapApiGate(value: ApiGateVO): TicketGate {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的检票口 ID 不完整')
  if (value.floor_id === undefined || value.floor_id === null) throw responseError('服务器返回的检票口楼层 ID 不完整')
  const point = { lng: Number(value.lng), lat: Number(value.lat) }
  // if (!isFinitePoint(point)) throw responseError('服务器返回的检票口定位不合法')
  return {
    id: String(value.id),
    code: requiredText(value.code, '检票口编号'),
    name: requiredText(value.name, '检票口名称'),
    floorId: String(value.floor_id),
    floorName: requiredText(value.floor_name, '检票口楼层名称'),
    locationDescription: typeof value.location_desc === 'string' ? value.location_desc : '',
    point,
    navigationAddress: typeof value.nav_address === 'string' ? value.nav_address : '',
    sortOrder: integer(value.sort_order),
    status: mapOpenStatus(value.open_status),
    statusRemark: typeof value.status_remark === 'string' ? value.status_remark : '',
    enabled: integer(value.status, 1) !== 0,
    zoneIds: stringIds(value.zone_ids),
    zoneNames: stringList(value.zone_names),
    matchOpen: flag(value.match_open),
    createdAt: requiredText(value.create_at, '检票口创建时间'),
    updatedAt: requiredText(value.update_at, '检票口更新时间'),
  }
}

export function mapApiGateFloor(value: ApiGateFloorVO): TicketGateFloorOption {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的楼层 ID 不完整')
  return {
    id: String(value.id),
    name: requiredText(value.name, '楼层名称'),
    enabled: integer(value.status, 1) !== 0,
    sortOrder: integer(value.sort_order),
  }
}

export function mapApiGatePage(value: ApiGatePage): TicketGatePage {
  return {
    records: Array.isArray(value.list) ? value.list.map(mapApiGate) : [],
    total: nonNegativeInteger(value.total),
    page: Math.max(1, integer(value.page, 1)),
    pageSize: Math.max(1, integer(value.page_size, 20)),
  }
}

export function sortTicketGates(records: readonly TicketGate[]): TicketGate[] {
  return [...records]
    .sort((first, second) => first.sortOrder - second.sortOrder || first.code.localeCompare(second.code, 'zh-CN', { numeric: true }))
    .map(cloneGate)
}

function filterParameters(query: TicketGateQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  const keyword = normalizeText(query.keyword)
  if (keyword) params.keyword = keyword
  if (query.floorId !== 'all') params.floor_id = query.floorId
  if (query.status !== 'all') params.open_status = apiOpenStatus(query.status)
  return params
}

function queryParameters(page: number, pageSize: number, query: TicketGateQuery): Record<string, string | number> {
  return { page, page_size: pageSize, ...filterParameters(query) }
}

function createBody(input: TicketGateWriteInput): ApiGateCreateRequest {
  const value = sanitizeTicketGateInput(input)
  const point = parseMapCoordinates(value.mapCoordinates)
  return {
    code: value.code,
    name: value.name,
    floor_id: bodyId(value.floorId),
    location_desc: value.locationDescription,
    lng: point.lng,
    lat: point.lat,
    nav_address: value.navigationAddress,
    open_status: apiOpenStatus(value.status),
    status_remark: value.statusRemark,
    sort_order: value.sortOrder,
    status: 1,
  }
}

function updateBody(input: TicketGateWriteInput): ApiGateUpdateRequest {
  const data = createBody(input)
  return {
    name: data.name,
    floor_id: data.floor_id,
    location_desc: data.location_desc,
    lng: data.lng,
    lat: data.lat,
    nav_address: data.nav_address,
    open_status: data.open_status,
    status_remark: data.status_remark,
    sort_order: data.sort_order,
  }
}

const DEFAULT_QUERY: TicketGateQuery = { keyword: '', status: 'all', floorId: 'all' }
const MAX_PAGE_SIZE = 100

const defaultFileRequester: TicketGateFileRequester = config => rawHttpClient.request<Blob>(config)

export function createTicketGateService(
  request: TicketGateDataRequester = requestData,
  requestFile: TicketGateFileRequester = defaultFileRequester,
): TicketGateService {
  const service: TicketGateService = {
    async listPage(page, pageSize, query) {
      return mapApiGatePage(await request<ApiGatePage>({
        method: 'GET',
        url: 'api/v1/admin/gates',
        params: queryParameters(page, pageSize, query),
      }))
    },

    async list(query = DEFAULT_QUERY) {
      const first = await service.listPage(1, MAX_PAGE_SIZE, query)
      const records = [...first.records]
      const pageCount = Math.ceil(first.total / Math.max(1, first.pageSize))
      for (let page = 2; page <= pageCount; page += 1) {
        records.push(...(await service.listPage(page, MAX_PAGE_SIZE, query)).records)
      }
      return sortTicketGates([...new Map(records.map((record) => [record.id, record])).values()])
    },

    async exportCsv(query) {
      const response = await requestFile({
        method: 'GET',
        url: 'api/v1/admin/gates/export',
        params: filterParameters(query),
        responseType: 'blob',
        headers: { Accept: 'text/csv' },
      })
      return mapCsvExportResponse(response, 'gates.csv')
    },

    async listFloors() {
      const values = await request<ApiGateFloorVO[]>({ method: 'GET', url: 'api/v1/admin/floors' })
      return (Array.isArray(values) ? values.map(mapApiGateFloor) : [])
        .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name, 'zh-CN'))
    },

    async get(id) {
      return mapApiGate(await request<ApiGateVO>({ method: 'GET', url: endpoint('api/v1/admin/gates', id) }))
    },

    async create(input) {
      const validation = validateTicketGateInput(input)
      if (!validation.valid) throw new TicketGateServiceError(validation.issues[0]!.message)
      const data = createBody(input)
      return mapApiGate(await request<ApiGateVO, ApiGateCreateRequest>({ method: 'POST', url: 'api/v1/admin/gates', data }))
    },

    async update(id, input) {
      const validation = validateTicketGateInput(input)
      if (!validation.valid) throw new TicketGateServiceError(validation.issues[0]!.message)
      const data = updateBody(input)
      return mapApiGate(await request<ApiGateVO, ApiGateUpdateRequest>({
        method: 'PATCH',
        url: endpoint('api/v1/admin/gates', id),
        data,
      }))
    },

    async updateStatus(id, input) {
      if (!isStatus(input.status)) throw new TicketGateServiceError('请选择有效的检票口状态')
      const detail = await service.get(id)
      const data: ApiGateStatusRequest = {
        name: detail.name,
        lng: detail.point.lng,
        lat: detail.point.lat,
        open_status: apiOpenStatus(input.status),
        status_remark: input.status === 'open' ? '' : normalizeText(input.statusRemark),
      }
      return mapApiGate(await request<ApiGateVO, ApiGateStatusRequest>({
        method: 'PATCH',
        url: endpoint('api/v1/admin/gates', id),
        data,
      }))
    },

    async remove(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/gates', id) })
    },
  }

  return service
}

export const ticketGateService = createTicketGateService()
