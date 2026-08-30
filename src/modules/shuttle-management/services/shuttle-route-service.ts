import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type {
  ShuttleDirection,
  ShuttleOperatingStatus,
  ShuttleRoute,
  ShuttleRouteCreateInput,
  ShuttleRoutePage,
  ShuttleRouteQuery,
  ShuttleRouteService,
  ShuttleRouteUpdateInput,
  ShuttleRouteValidationIssue,
  ShuttleStation,
  ShuttleStationValidationIssue,
  ValidationResult,
} from '../types'
import { isValidGeoPoint } from '@/components/map/geometry'
import { ApiError, mapCsvExportResponse, rawHttpClient, requestData } from '@/lib/http'

type ApiShuttleDirection = 1 | 2
type ApiShuttleOperatingStatus = 0 | 1 | 2

export interface ApiShuttleStopVO {
  id: number | string
  create_at: string
  update_at: string
  line_id: number | string
  code: string | null
  name: string
  seq: number | string
  lng: number | string | null
  lat: number | string | null
  nav_address: string | null
  arrival_offset_minutes: number | string | null
  status: number | boolean
  arrival_gate_ids: Array<number | string> | null
}

export interface ApiShuttleLineVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  name: string
  direction: number | string
  description: string | null
  first_bus: string
  last_bus: string
  interval_minutes: number | string
  duration_minutes: number | string
  operate_status: number | string
  realtime_text: string | null
  data_source: string
  sync_status: string | null
  last_sync_at: string | null
  realtime_lng: number | string | null
  realtime_lat: number | string | null
  realtime_eta: string | null
  sort_order: number | string
  status: number | boolean
  stop_count: number | string
  stops?: ApiShuttleStopVO[] | null
}

export interface ApiShuttleLinePage {
  list: ApiShuttleLineVO[]
  total: number | string
  page: number | string
  page_size: number | string
}

interface ApiShuttleLineWriteRequest {
  code?: string
  name: string
  direction: ApiShuttleDirection
  description: string
  first_bus: string
  last_bus: string
  interval_minutes: number
  duration_minutes: number
  operate_status: ApiShuttleOperatingStatus
  sort_order: number
  status: 0 | 1
}

interface ApiShuttleStopWriteRequest {
  name: string
  seq: number
  lng: number
  lat: number
  nav_address: string
  arrival_gate_ids: string[]
}

interface ApiShuttleStopsReplaceRequest {
  stops: ApiShuttleStopWriteRequest[]
}

export interface ShuttleRouteDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

export interface ShuttleRouteFileRequester {
  (config: SignedRequestConfig): Promise<AxiosResponse<Blob>>
}

export class ShuttleRouteServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ShuttleRouteServiceError'
  }
}

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function normalizedIdentity(value: string): string {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw responseError(`服务器返回的${field}不完整`)
  return value
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function integer(value: unknown, field: string): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result)) throw responseError(`服务器返回的${field}无效`)
  return result
}

function positiveInteger(value: unknown, field: string): number {
  const result = integer(value, field)
  if (result <= 0) throw responseError(`服务器返回的${field}无效`)
  return result
}

function nonNegativeInteger(value: unknown, field: string): number {
  const result = integer(value, field)
  if (result < 0) throw responseError(`服务器返回的${field}无效`)
  return result
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function isDirection(value: unknown): value is ShuttleDirection {
  return value === 'inbound' || value === 'outbound'
}

function isOperatingStatus(value: unknown): value is ShuttleOperatingStatus {
  return value === 'operating' || value === 'suspended' || value === 'partial'
}

function mapDirection(value: unknown): ShuttleDirection {
  const direction = integer(value, '线路方向')
  if (direction === 1) return 'inbound'
  if (direction === 2) return 'outbound'
  throw responseError('服务器返回的线路方向无效')
}

function apiDirection(value: ShuttleDirection): ApiShuttleDirection {
  return value === 'inbound' ? 1 : 2
}

function mapOperatingStatus(value: unknown): ShuttleOperatingStatus {
  const status = integer(value, '线路运营状态')
  if (status === 0) return 'suspended'
  if (status === 1) return 'operating'
  if (status === 2) return 'partial'
  throw responseError('服务器返回的线路运营状态无效')
}

function apiOperatingStatus(value: ShuttleOperatingStatus): ApiShuttleOperatingStatus {
  if (value === 'suspended') return 0
  if (value === 'partial') return 2
  return 1
}

function cloneStation(station: ShuttleStation): ShuttleStation {
  return {
    id: station.id,
    name: station.name,
    point: station.point ? { ...station.point } : null,
    navigationAddress: station.navigationAddress,
    arrivalGateIds: [...station.arrivalGateIds],
  }
}

function cloneRoute(route: ShuttleRoute): ShuttleRoute {
  return { ...route, stations: route.stations.map(cloneStation) }
}

function endpoint(id: string, suffix = ''): string {
  return `api/v1/admin/shuttle/lines/${encodeURIComponent(id)}${suffix}`
}

export function sanitizeShuttleRouteBaseInput(input: ShuttleRouteUpdateInput): ShuttleRouteUpdateInput {
  return {
    name: normalizeText(input.name),
    direction: input.direction,
    description: normalizeText(input.description),
    firstDeparture: input.firstDeparture.trim(),
    lastDeparture: input.lastDeparture.trim(),
    departureIntervalMinutes: Number(input.departureIntervalMinutes),
    durationMinutes: Number(input.durationMinutes),
    operatingStatus: input.operatingStatus,
    sortOrder: Number(input.sortOrder),
    enabled: Boolean(input.enabled),
  }
}

export function sanitizeShuttleRouteCreateInput(input: ShuttleRouteCreateInput): ShuttleRouteCreateInput {
  return { ...sanitizeShuttleRouteBaseInput(input), code: normalizeText(input.code).toUpperCase() }
}

export function sanitizeShuttleStations(stations: readonly ShuttleStation[]): ShuttleStation[] {
  return stations.map((station) => ({
    id: station.id,
    name: normalizeText(station.name),
    point: station.point ? { lng: Number(station.point.lng), lat: Number(station.point.lat) } : null,
    navigationAddress: normalizeText(station.navigationAddress),
    arrivalGateIds: [...new Set(station.arrivalGateIds.map(id => id.trim()).filter(Boolean))],
  }))
}

function validateBase(input: ShuttleRouteUpdateInput): ShuttleRouteValidationIssue[] {
  const value = sanitizeShuttleRouteBaseInput(input)
  const issues: ShuttleRouteValidationIssue[] = []
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  const hasFirst = timePattern.test(value.firstDeparture)
  const hasLast = timePattern.test(value.lastDeparture)
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入线路名称' })
  if (!isDirection(value.direction)) issues.push({ field: 'direction', code: 'invalid', message: '请选择线路方向' })
  if (!hasFirst) issues.push({ field: 'firstDeparture', code: 'required', message: '请选择首班时间' })
  if (!hasLast) issues.push({ field: 'lastDeparture', code: 'required', message: '请选择末班时间' })
  if (hasFirst && hasLast && value.firstDeparture >= value.lastDeparture) {
    issues.push({ field: 'schedule', code: 'range', message: '首班时间必须早于末班时间' })
  }
  if (!Number.isInteger(value.departureIntervalMinutes) || value.departureIntervalMinutes < 5) {
    issues.push({ field: 'departureIntervalMinutes', code: 'range', message: '发车间隔必须是不小于 5 的整数' })
  }
  if (!Number.isInteger(value.durationMinutes) || value.durationMinutes <= 0) {
    issues.push({ field: 'durationMinutes', code: 'range', message: '全程时长必须是正整数' })
  }
  if (!isOperatingStatus(value.operatingStatus)) issues.push({ field: 'operatingStatus', code: 'invalid', message: '请选择运营状态' })
  if (!Number.isInteger(value.sortOrder) || value.sortOrder < 0) issues.push({ field: 'sortOrder', code: 'range', message: '排序号必须是非负整数' })
  return issues
}

export function validateShuttleRouteCreateInput(
  input: ShuttleRouteCreateInput,
  records: readonly ShuttleRoute[] = [],
): ValidationResult<ShuttleRouteValidationIssue> {
  const value = sanitizeShuttleRouteCreateInput(input)
  const issues = validateBase(value)
  if (!value.code) issues.unshift({ field: 'code', code: 'required', message: '请输入线路编号' })
  else if (!/^[A-Z0-9]{2,10}$/.test(value.code)) issues.unshift({ field: 'code', code: 'invalid', message: '线路编号须为 2–10 位字母或数字' })
  else if (records.some(item => normalizedIdentity(item.code) === normalizedIdentity(value.code))) {
    issues.unshift({ field: 'code', code: 'duplicate', message: '线路编号不能重复' })
  }
  return { valid: issues.length === 0, issues }
}

export function validateShuttleRouteUpdateInput(input: ShuttleRouteUpdateInput): ValidationResult<ShuttleRouteValidationIssue> {
  const issues = validateBase(input)
  return { valid: issues.length === 0, issues }
}

export function validateShuttleStations(stationsInput: readonly ShuttleStation[]): ValidationResult<ShuttleStationValidationIssue> {
  const stations = sanitizeShuttleStations(stationsInput)
  const issues: ShuttleStationValidationIssue[] = []
  if (stations.length === 0) issues.push({ field: 'stations', code: 'required', message: '每条线路至少保留 1 个站点' })
  if (stations.length > 20) issues.push({ field: 'stations', code: 'limit', message: '每条线路最多配置 20 个站点' })
  for (const station of stations) {
    if (!station.name) issues.push({ field: 'name', stationId: station.id, code: 'required', message: '请输入站点名称' })
    if (!station.point) issues.push({ field: 'point', stationId: station.id, code: 'required', message: '请输入站点定位经纬度' })
    else if (!isValidGeoPoint(station.point)) issues.push({ field: 'point', stationId: station.id, code: 'invalid', message: '请输入合法的经度,纬度' })
  }
  return { valid: issues.length === 0, issues }
}

export function sortShuttleRoutes(records: readonly ShuttleRoute[]): ShuttleRoute[] {
  return [...records]
    .sort((first, second) => first.sortOrder - second.sortOrder || second.updatedAt.localeCompare(first.updatedAt) || first.code.localeCompare(second.code, 'zh-CN'))
    .map(cloneRoute)
}

function mapArrivalGateIds(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw responseError('服务器返回的到达检票口数据无效')
  return [...new Set(value.map((id) => {
    if (id === null || id === undefined || !String(id).trim()) throw responseError('服务器返回的检票口 ID 不完整')
    return String(id)
  }))]
}

export function mapApiShuttleStop(value: ApiShuttleStopVO): ShuttleStation {
  if (value.id === null || value.id === undefined) throw responseError('服务器返回的站点 ID 不完整')
  let point: ShuttleStation['point'] = null
  if (value.lng !== null && value.lng !== undefined && value.lat !== null && value.lat !== undefined) {
    const mapped = { lng: Number(value.lng), lat: Number(value.lat) }
    if (!isValidGeoPoint(mapped)) throw responseError('服务器返回的站点定位无效')
    point = mapped
  }
  return {
    id: String(value.id),
    name: requiredText(value.name, '站点名称'),
    point,
    navigationAddress: optionalText(value.nav_address),
    arrivalGateIds: mapArrivalGateIds(value.arrival_gate_ids),
  }
}

function mapApiStops(value: unknown): ShuttleStation[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw responseError('服务器返回的线路站点数据无效')
  return [...value]
    .sort((first, second) => integer((first as ApiShuttleStopVO).seq, '站点顺序') - integer((second as ApiShuttleStopVO).seq, '站点顺序'))
    .map(item => mapApiShuttleStop(item as ApiShuttleStopVO))
}

export function mapApiShuttleRoute(value: ApiShuttleLineVO, stops: unknown = value.stops): ShuttleRoute {
  if (value.id === null || value.id === undefined) throw responseError('服务器返回的线路 ID 不完整')
  return {
    id: String(value.id),
    code: requiredText(value.code, '线路编号'),
    name: requiredText(value.name, '线路名称'),
    direction: mapDirection(value.direction),
    description: optionalText(value.description),
    firstDeparture: requiredText(value.first_bus, '首班时间'),
    lastDeparture: requiredText(value.last_bus, '末班时间'),
    departureIntervalMinutes: positiveInteger(value.interval_minutes, '发车间隔'),
    durationMinutes: positiveInteger(value.duration_minutes, '全程时长'),
    operatingStatus: mapOperatingStatus(value.operate_status),
    sortOrder: nonNegativeInteger(value.sort_order, '线路排序'),
    enabled: flag(value.status),
    stations: mapApiStops(stops),
    coordinateSystem: 'GCJ-02',
    createdAt: requiredText(value.create_at, '线路创建时间'),
    updatedAt: requiredText(value.update_at, '线路更新时间'),
  }
}

function lineBody(input: ShuttleRouteUpdateInput): ApiShuttleLineWriteRequest {
  const value = sanitizeShuttleRouteBaseInput(input)
  return {
    name: value.name,
    direction: apiDirection(value.direction),
    description: value.description,
    first_bus: value.firstDeparture,
    last_bus: value.lastDeparture,
    interval_minutes: value.departureIntervalMinutes,
    duration_minutes: value.durationMinutes,
    operate_status: apiOperatingStatus(value.operatingStatus),
    sort_order: value.sortOrder,
    status: value.enabled ? 1 : 0,
  }
}

function stopBody(station: ShuttleStation, sequence: number): ApiShuttleStopWriteRequest {
  if (!station.point) throw new ShuttleRouteServiceError('请输入站点定位经纬度')
  return {
    name: station.name,
    seq: sequence,
    lng: station.point.lng,
    lat: station.point.lat,
    nav_address: station.navigationAddress,
    arrival_gate_ids: [...station.arrivalGateIds],
  }
}

function exportParameters(query: ShuttleRouteQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  const keyword = normalizeText(query.keyword)
  if (keyword) params.keyword = keyword
  if (query.direction !== 'all') params.direction = apiDirection(query.direction)
  if (query.operatingStatus !== 'all') params.operate_status = apiOperatingStatus(query.operatingStatus)
  return params
}

function throwForValidation(issues: readonly ShuttleRouteValidationIssue[] | readonly ShuttleStationValidationIssue[]): never {
  throw new ShuttleRouteServiceError(issues[0]?.message ?? '接驳线路信息校验失败')
}

const DEFAULT_QUERY: ShuttleRouteQuery = {
  keyword: '',
  direction: 'all',
  operatingStatus: 'all',
}
const MAX_PAGE_SIZE = 100

function queryParameters(page: number, pageSize: number, query: ShuttleRouteQuery): Record<string, string | number> {
  return { page, page_size: pageSize, ...exportParameters(query) }
}

function mapApiShuttlePage(value: ApiShuttleLinePage): ShuttleRoutePage {
  return {
    records: Array.isArray(value.list) ? value.list.map(item => mapApiShuttleRoute(item)) : [],
    total: nonNegativeInteger(value.total, '线路总数'),
    page: Math.max(1, integer(value.page, '页码')),
    pageSize: Math.max(1, integer(value.page_size, '每页条数')),
  }
}

const defaultFileRequester: ShuttleRouteFileRequester = config => rawHttpClient.request<Blob>(config)

export function createShuttleRouteService(
  request: ShuttleRouteDataRequester = requestData,
  requestFile: ShuttleRouteFileRequester = defaultFileRequester,
): ShuttleRouteService {
  async function rawDetail(id: string): Promise<ApiShuttleLineVO> {
    return request<ApiShuttleLineVO>({ method: 'GET', url: endpoint(id) })
  }

  const service: ShuttleRouteService = {
    async listPage(page, pageSize, query = DEFAULT_QUERY) {
      return mapApiShuttlePage(await request<ApiShuttleLinePage>({
        method: 'GET',
        url: 'api/v1/admin/shuttle/lines',
        params: queryParameters(page, pageSize, query),
      }))
    },

    async list(query = DEFAULT_QUERY) {
      const first = await service.listPage(1, MAX_PAGE_SIZE, query)
      const records = [...first.records]
      for (let page = 2; page <= Math.ceil(first.total / Math.max(1, first.pageSize)); page += 1) {
        records.push(...(await service.listPage(page, MAX_PAGE_SIZE, query)).records)
      }
      return sortShuttleRoutes([...new Map(records.map(record => [record.id, record])).values()])
    },

    async exportCsv(query) {
      const response = await requestFile({
        method: 'GET',
        url: 'api/v1/admin/shuttle/lines/export',
        params: exportParameters(query),
        responseType: 'blob',
        headers: { Accept: 'text/csv' },
      })
      return mapCsvExportResponse(response, 'shuttle_lines.csv')
    },

    async create(input) {
      const validation = validateShuttleRouteCreateInput(input)
      if (!validation.valid) throwForValidation(validation.issues)
      const value = sanitizeShuttleRouteCreateInput(input)
      const data: ApiShuttleLineWriteRequest = { ...lineBody(value), code: value.code }
      const created = await request<ApiShuttleLineVO, ApiShuttleLineWriteRequest>({
        method: 'POST',
        url: 'api/v1/admin/shuttle/lines',
        data,
      })
      return mapApiShuttleRoute(created)
    },

    async update(id, input) {
      const validation = validateShuttleRouteUpdateInput(input)
      if (!validation.valid) throwForValidation(validation.issues)
      const latest = await rawDetail(id)
      const updated = await request<ApiShuttleLineVO, ApiShuttleLineWriteRequest>({
        method: 'PATCH',
        url: endpoint(id),
        data: lineBody(input),
      })
      return mapApiShuttleRoute(updated, updated.stops ?? latest.stops)
    },

    async replaceStations(id, stationsInput) {
      const validation = validateShuttleStations(stationsInput)
      if (!validation.valid) throwForValidation(validation.issues)
      const stations = sanitizeShuttleStations(stationsInput)
      const data: ApiShuttleStopsReplaceRequest = {
        stops: stations.map((station, index) => stopBody(station, index + 1)),
      }
      return mapApiShuttleRoute(await request<ApiShuttleLineVO, ApiShuttleStopsReplaceRequest>({
        method: 'PUT',
        url: endpoint(id, '/stops'),
        data,
      }))
    },

    async remove(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint(id) })
    },
  }

  return service
}

export const shuttleRouteService = createShuttleRouteService()
