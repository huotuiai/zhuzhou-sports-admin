import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type {
  ParkingAvailabilityUpdateMethod,
  ParkingFeeType,
  ParkingLot,
  ParkingLotBaseInput,
  ParkingLotCreateInput,
  ParkingLotCreateOptions,
  ParkingLotDetail,
  ParkingLotGateBindingValue,
  ParkingLotImportResult,
  ParkingLotPage,
  ParkingLotQuery,
  ParkingLotService,
  ParkingLotUpdateOptions,
  ParkingLotValidationField,
  ParkingLotValidationIssue,
  ParkingLotValidationResult,
  ParkingOpenStatus,
} from '../types'
import { isValidGeoPoint } from '@/components/map/geometry'
import { ApiError, mapCsvExportResponse, rawHttpClient, requestData } from '@/lib/http'

type ApiParkingOpenStatus = 0 | 1 | 2
type ApiParkingUpdateMode = 'manual' | 'sync'

export interface ApiParkingDirectGate {
  gate_id: number | string
  gate_name?: string | null
  walk_minutes: number | string | null
}

export interface ApiParkingVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  name: string
  location_desc: string | null
  lng: number
  lat: number
  nav_address: string | null
  capacity: number | string
  remain: number | string | null
  update_mode: string
  last_remain_at: string | null
  is_free: number | boolean
  fee_desc: string | null
  open_status: number
  recommend_weight: number | string
  sort_order: number | string
  external_code: string | null
  remark: string | null
  status: number | boolean
  direct_gates: ApiParkingDirectGate[] | null
}

export interface ApiParkingPage {
  list: ApiParkingVO[]
  total: number | string
  page: number | string
  page_size: number | string
}

interface ApiParkingWriteRequest {
  code?: string
  name: string
  location_desc: string
  lng: number
  lat: number
  nav_address: string
  capacity: number
  remain?: number
  update_mode: ApiParkingUpdateMode
  is_free: 0 | 1
  fee_desc: string
  open_status: ApiParkingOpenStatus
  recommend_weight: number
  sort_order: number
  remark: string
  status: 0 | 1
  direct_gates?: Array<{ gate_id: number, walk_minutes: number }>
}

interface ApiParkingEnabledRequest {
  name: string
  lng: number
  lat: number
  status: 0 | 1
}

interface ApiParkingImportRequest {
  csv: string
}

interface ApiParkingImportResponse {
  imported: number | string
}

export interface ParkingLotDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

export interface ParkingLotFileRequester {
  (config: SignedRequestConfig): Promise<AxiosResponse<Blob>>
}

export class ParkingLotServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ParkingLotServiceError'
  }
}

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function codeIdentity(code: string): string {
  return normalizeText(code).toLocaleUpperCase('en-US')
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
  if (!Number.isInteger(result)) throw responseError(`服务器返回的${field}无效`)
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
  return value === true || value === 1
}

function clonePoint(point: ParkingLot['point']): ParkingLot['point'] {
  return point ? { lng: point.lng, lat: point.lat } : null
}

function cloneParkingLot(record: ParkingLot): ParkingLot {
  return { ...record, point: clonePoint(record.point) }
}

function isFeeType(value: unknown): value is ParkingFeeType {
  return value === 'free' || value === 'paid'
}

function isOpenStatus(value: unknown): value is ParkingOpenStatus {
  return value === 'open' || value === 'closed'
}

function isAvailabilityUpdateMethod(value: unknown): value is ParkingAvailabilityUpdateMethod {
  return value === 'integrated' || value === 'manual'
}

function mapUpdateMethod(value: unknown): ParkingAvailabilityUpdateMethod {
  if (value === 'manual') return 'manual'
  if (value === 'sync') return 'integrated'
  throw responseError('服务器返回的余位更新方式无效')
}

function apiUpdateMethod(value: ParkingAvailabilityUpdateMethod): ApiParkingUpdateMode {
  return value === 'integrated' ? 'sync' : 'manual'
}

function mapOpenStatus(value: unknown): ParkingOpenStatus {
  const status = integer(value, '停车场开放状态')
  if (status === 0 || status === 2) return 'closed'
  if (status === 1) return 'open'
  throw responseError('服务器返回的停车场开放状态无效')
}

function rawOpenStatus(value: unknown): ApiParkingOpenStatus {
  const status = integer(value, '停车场开放状态')
  if (status === 0 || status === 1 || status === 2) return status
  throw responseError('服务器返回的停车场开放状态无效')
}

function apiOpenStatus(value: ParkingOpenStatus): 0 | 1 {
  return value === 'open' ? 1 : 0
}

function bodyId(value: string): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new ApiError('检票口 ID 超出浏览器可安全提交的范围', { kind: 'configuration' })
  }
  return result
}

function endpoint(id: string, suffix = ''): string {
  return `api/v1/admin/parkings/${encodeURIComponent(id)}${suffix}`
}

function characterCount(value: string): number {
  return Array.from(value).length
}

export function sanitizeParkingLotBaseInput(input: ParkingLotBaseInput): ParkingLotBaseInput {
  return {
    name: normalizeText(input.name),
    locationDescription: normalizeText(input.locationDescription),
    point: clonePoint(input.point),
    navigationAddress: normalizeText(input.navigationAddress),
    totalSpaces: Number(input.totalSpaces),
    availabilityUpdateMethod: input.availabilityUpdateMethod,
    feeType: input.feeType,
    feeStandard: input.feeType === 'free' ? '' : normalizeText(input.feeStandard),
    openStatus: input.openStatus,
    enabled: Boolean(input.enabled),
    recommendationWeight: Number(input.recommendationWeight),
    sortOrder: Number(input.sortOrder),
    remark: normalizeText(input.remark),
  }
}

export function sanitizeParkingLotCreateInput(input: ParkingLotCreateInput): ParkingLotCreateInput {
  return { ...sanitizeParkingLotBaseInput(input), code: codeIdentity(input.code), availabilityUpdateMethod: 'manual' }
}

function pushLengthIssue(
  issues: ParkingLotValidationIssue[],
  field: ParkingLotValidationField,
  value: string,
  maximum: number,
  label: string,
): void {
  if (characterCount(value) > maximum) {
    issues.push({ field, code: 'too_long', message: `${label}不能超过 ${maximum} 个字符` })
  }
}

export function validateParkingLotBaseInput(input: ParkingLotBaseInput): ParkingLotValidationResult {
  const value = sanitizeParkingLotBaseInput(input)
  const issues: ParkingLotValidationIssue[] = []

  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入停车场名称' })
  else pushLengthIssue(issues, 'name', value.name, 50, '停车场名称')
  pushLengthIssue(issues, 'locationDescription', value.locationDescription, 100, '位置描述')
  pushLengthIssue(issues, 'navigationAddress', value.navigationAddress, 200, '导航地址')
  pushLengthIssue(issues, 'remark', value.remark, 300, '备注')

  if (!value.point) issues.push({ field: 'point', code: 'required', message: '请输入定位经纬度' })
  else if (!isValidGeoPoint(value.point)) issues.push({ field: 'point', code: 'invalid', message: '请输入合法的经度,纬度' })
  if (!Number.isInteger(value.totalSpaces) || value.totalSpaces <= 0) {
    issues.push({ field: 'totalSpaces', code: 'range', message: '总车位数必须是正整数' })
  }
  if (!isAvailabilityUpdateMethod(value.availabilityUpdateMethod)) {
    issues.push({ field: 'availabilityUpdateMethod', code: 'invalid', message: '请选择车位更新方式' })
  }
  if (!isFeeType(value.feeType)) {
    issues.push({ field: 'feeType', code: 'invalid', message: '请选择收费类型' })
  }
  else if (value.feeType === 'paid') {
    if (!value.feeStandard) issues.push({ field: 'feeStandard', code: 'required', message: '请输入收费标准' })
    else pushLengthIssue(issues, 'feeStandard', value.feeStandard, 300, '收费标准')
  }
  if (!isOpenStatus(value.openStatus)) {
    issues.push({ field: 'openStatus', code: 'invalid', message: '请选择开放状态' })
  }
  if (!Number.isInteger(value.recommendationWeight) || value.recommendationWeight < 0 || value.recommendationWeight > 100) {
    issues.push({ field: 'recommendationWeight', code: 'range', message: '推荐权重必须是 0–100 的整数' })
  }
  if (!Number.isInteger(value.sortOrder) || value.sortOrder < 0) {
    issues.push({ field: 'sortOrder', code: 'range', message: '排序号必须是非负整数' })
  }

  return { valid: issues.length === 0, issues }
}

export function validateParkingLotCreateInput(
  input: ParkingLotCreateInput,
  records: readonly ParkingLot[] = [],
): ParkingLotValidationResult {
  const value = sanitizeParkingLotCreateInput(input)
  const issues = [...validateParkingLotBaseInput(value).issues]
  if (!value.code) issues.unshift({ field: 'code', code: 'required', message: '请输入停车场编号' })
  else if (!/^[A-Z0-9-]{2,10}$/.test(value.code)) {
    issues.unshift({ field: 'code', code: 'invalid', message: '编号须为 2–10 位字母、数字或连字符' })
  }
  else if (records.some((record) => codeIdentity(record.code) === value.code)) {
    issues.unshift({ field: 'code', code: 'duplicate', message: '停车场编号不能重复' })
  }
  return { valid: issues.length === 0, issues }
}

function throwForValidation(issues: readonly ParkingLotValidationIssue[]): never {
  throw new ParkingLotServiceError(issues[0]?.message ?? '停车场信息校验失败')
}

export function sortParkingLots(records: readonly ParkingLot[]): ParkingLot[] {
  return [...records]
    .sort((first, second) =>
      first.sortOrder - second.sortOrder ||
      second.updatedAt.localeCompare(first.updatedAt) ||
      first.code.localeCompare(second.code, 'zh-CN'),
    )
    .map(cloneParkingLot)
}

function mapDirectGates(value: unknown): ParkingLotGateBindingValue[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw responseError('服务器返回的附近检票口数据无效')
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw responseError('服务器返回的附近检票口数据无效')
    const gate = item as Record<string, unknown>
    if (gate.gate_id === undefined || gate.gate_id === null) throw responseError('服务器返回的检票口 ID 不完整')
    return {
      gateId: String(gate.gate_id),
      walkingMinutes: positiveInteger(gate.walk_minutes, '检票口步行时间'),
    }
  })
}

export function mapApiParkingLot(value: ApiParkingVO): ParkingLot {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的停车场 ID 不完整')
  const point = { lng: Number(value.lng), lat: Number(value.lat) }
  if (!isValidGeoPoint(point)) throw responseError('服务器返回的停车场定位无效')
  const totalSpaces = positiveInteger(value.capacity, '停车场总车位')
  const availableSpaces = value.remain === null || value.remain === undefined
    ? 0
    : nonNegativeInteger(value.remain, '停车场空余车位')
  if (availableSpaces > totalSpaces) throw responseError('服务器返回的空余车位超过总车位')
  return {
    id: String(value.id),
    code: requiredText(value.code, '停车场编号'),
    name: requiredText(value.name, '停车场名称'),
    locationDescription: optionalText(value.location_desc),
    point,
    navigationAddress: optionalText(value.nav_address),
    totalSpaces,
    availableSpaces,
    availabilityUpdateMethod: mapUpdateMethod(value.update_mode),
    feeType: flag(value.is_free) ? 'free' : 'paid',
    feeStandard: optionalText(value.fee_desc),
    openStatus: mapOpenStatus(value.open_status),
    enabled: flag(value.status),
    recommendationWeight: nonNegativeInteger(value.recommend_weight, '停车场推荐权重'),
    sortOrder: nonNegativeInteger(value.sort_order, '停车场排序'),
    remark: optionalText(value.remark),
    coordinateSystem: 'GCJ-02',
    availabilityUpdatedAt: optionalText(value.last_remain_at),
    createdAt: requiredText(value.create_at, '停车场创建时间'),
    updatedAt: requiredText(value.update_at, '停车场更新时间'),
  }
}

export function mapApiParkingDetail(value: ApiParkingVO): ParkingLotDetail {
  return {
    record: mapApiParkingLot(value),
    nearbyGateBindings: mapDirectGates(value.direct_gates),
  }
}

function directGateBody(bindings: readonly ParkingLotGateBindingValue[]): Array<{ gate_id: number, walk_minutes: number }> {
  const gateIds = new Set<string>()
  return bindings.map((binding) => {
    if (gateIds.has(binding.gateId)) throw new ParkingLotServiceError('同一检票口不能重复绑定')
    gateIds.add(binding.gateId)
    const walkingMinutes = Number(binding.walkingMinutes)
    if (!Number.isInteger(walkingMinutes) || walkingMinutes <= 0) {
      throw new ParkingLotServiceError('步行时间必须是大于 0 的整数')
    }
    return { gate_id: bodyId(binding.gateId), walk_minutes: walkingMinutes }
  })
}

function writeBody(input: ParkingLotBaseInput, originalOpenStatus: ApiParkingOpenStatus): ApiParkingWriteRequest {
  const value = sanitizeParkingLotBaseInput(input)
  if (!value.point) throw new ParkingLotServiceError('请输入定位经纬度')
  return {
    name: value.name,
    location_desc: value.locationDescription,
    lng: value.point.lng,
    lat: value.point.lat,
    nav_address: value.navigationAddress,
    capacity: value.totalSpaces,
    update_mode: apiUpdateMethod(value.availabilityUpdateMethod),
    is_free: value.feeType === 'free' ? 1 : 0,
    fee_desc: value.feeStandard,
    open_status: value.openStatus === 'closed' && originalOpenStatus === 2 ? 2 : apiOpenStatus(value.openStatus),
    recommend_weight: value.recommendationWeight,
    sort_order: value.sortOrder,
    remark: value.remark,
    status: value.enabled ? 1 : 0,
  }
}

const DEFAULT_QUERY: ParkingLotQuery = {
  keyword: '',
  feeType: 'all',
  openStatus: 'all',
  availabilityUpdateMethod: 'all',
}
const MAX_PAGE_SIZE = 100

function filterParameters(query: ParkingLotQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  const keyword = normalizeText(query.keyword)
  if (keyword) params.keyword = keyword
  if (query.feeType === 'free') params.is_free = 1
  if (query.feeType === 'paid') params.is_free = 0
  if (query.openStatus === 'open') params.open_status = 1
  if (query.openStatus === 'closed') params.open_status = 0
  if (query.availabilityUpdateMethod !== 'all') params.update_mode = apiUpdateMethod(query.availabilityUpdateMethod)
  return params
}

function queryParameters(page: number, pageSize: number, query: ParkingLotQuery): Record<string, string | number> {
  return { page, page_size: pageSize, ...filterParameters(query) }
}

function mapApiParkingPage(value: ApiParkingPage): ParkingLotPage {
  return {
    records: Array.isArray(value.list) ? value.list.map(mapApiParkingLot) : [],
    total: nonNegativeInteger(value.total, '停车场总数'),
    page: Math.max(1, integer(value.page, '页码')),
    pageSize: Math.max(1, integer(value.page_size, '每页条数')),
  }
}

function mapParkingImportResult(value: ApiParkingImportResponse): ParkingLotImportResult {
  const imported = Number(value?.imported)
  if (!Number.isSafeInteger(imported) || imported < 0) throw responseError('服务器返回的导入数量无效')
  return { imported }
}

const defaultFileRequester: ParkingLotFileRequester = config => rawHttpClient.request<Blob>(config)

export function createParkingLotService(
  request: ParkingLotDataRequester = requestData,
  requestFile: ParkingLotFileRequester = defaultFileRequester,
): ParkingLotService {
  async function rawDetail(id: string): Promise<ApiParkingVO> {
    return request<ApiParkingVO>({ method: 'GET', url: endpoint(id) })
  }

  const service: ParkingLotService = {
    async listPage(page, pageSize, query = DEFAULT_QUERY) {
      return mapApiParkingPage(await request<ApiParkingPage>({
        method: 'GET',
        url: 'api/v1/admin/parkings',
        params: queryParameters(page, pageSize, query),
      }))
    },

    async list(query = DEFAULT_QUERY) {
      const first = await service.listPage(1, MAX_PAGE_SIZE, query)
      const records = [...first.records]
      for (let page = 2; page <= Math.ceil(first.total / Math.max(1, first.pageSize)); page += 1) {
        records.push(...(await service.listPage(page, MAX_PAGE_SIZE, query)).records)
      }
      return sortParkingLots([...new Map(records.map((record) => [record.id, record])).values()])
    },

    async get(id) {
      return mapApiParkingDetail(await rawDetail(id))
    },

    async create(input, options: ParkingLotCreateOptions = {}) {
      const validation = validateParkingLotCreateInput(input)
      if (!validation.valid) throwForValidation(validation.issues)
      const value = sanitizeParkingLotCreateInput(input)
      const data: ApiParkingWriteRequest = {
        ...writeBody(value, apiOpenStatus(value.openStatus)),
        code: value.code,
        remain: value.totalSpaces,
        update_mode: 'manual',
        direct_gates: directGateBody(options.nearbyGateBindings ?? []),
      }
      return mapApiParkingLot(await request<ApiParkingVO, ApiParkingWriteRequest>({
        method: 'POST',
        url: 'api/v1/admin/parkings',
        data,
      }))
    },

    async update(id, input, options: ParkingLotUpdateOptions = {}) {
      const validation = validateParkingLotBaseInput(input)
      if (!validation.valid) throwForValidation(validation.issues)
      const latest = await rawDetail(id)
      const value = sanitizeParkingLotBaseInput({
        ...input,
        availabilityUpdateMethod: mapUpdateMethod(latest.update_mode),
      })
      const data = writeBody(value, rawOpenStatus(latest.open_status))
      if (options.clampAvailableSpaces) data.remain = value.totalSpaces
      if (options.nearbyGateBindings !== undefined) data.direct_gates = directGateBody(options.nearbyGateBindings)
      return mapApiParkingLot(await request<ApiParkingVO, ApiParkingWriteRequest>({
        method: 'PATCH',
        url: endpoint(id),
        data,
      }))
    },

    async updateEnabled(id, enabled) {
      const latest = await rawDetail(id)
      const point = { lng: Number(latest.lng), lat: Number(latest.lat) }
      if (!isValidGeoPoint(point)) throw responseError('服务器返回的停车场定位无效')
      const data: ApiParkingEnabledRequest = {
        name: requiredText(latest.name, '停车场名称'),
        lng: point.lng,
        lat: point.lat,
        status: enabled ? 1 : 0,
      }
      return mapApiParkingLot(await request<ApiParkingVO, ApiParkingEnabledRequest>({
        method: 'PATCH',
        url: endpoint(id),
        data,
      }))
    },

    async updateAvailability(id, availableSpaces) {
      if (!Number.isInteger(availableSpaces) || availableSpaces < 0) {
        throw new ParkingLotServiceError('空余车位必须是非负整数')
      }
      return mapApiParkingLot(await request<ApiParkingVO, { remain: number }>({
        method: 'POST',
        url: endpoint(id, '/remain'),
        data: { remain: availableSpaces },
      }))
    },

    async remove(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint(id) })
    },

    async exportCsv() {
      const response = await requestFile({
        method: 'GET',
        url: 'api/v1/admin/parkings/export',
        responseType: 'blob',
        headers: { Accept: 'text/csv' },
      })
      return mapCsvExportResponse(response, 'parkings.csv')
    },

    async importCsv(csv: string) {
      const data: ApiParkingImportRequest = { csv }
      return mapParkingImportResult(await request<ApiParkingImportResponse, ApiParkingImportRequest>({
        method: 'POST',
        url: 'api/v1/admin/parkings/import',
        data,
      }))
    },
  }

  return service
}

export const parkingLotService = createParkingLotService()
