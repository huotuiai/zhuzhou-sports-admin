import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type {
  SeatFloor,
  SeatFloorCreateInput,
  SeatFloorValidationIssue,
  SeatFloorValidationResult,
  SeatFloorWriteInput,
  SeatGateOpenStatus,
  SeatGateOption,
  SeatPlanningService,
  SeatZone,
  SeatZoneImportResult,
  SeatZonePage,
  SeatZoneStatus,
  SeatZoneValidationIssue,
  SeatZoneValidationResult,
  SeatZoneWriteInput,
} from '../types'
import { ApiError, mapCsvExportResponse, rawHttpClient, requestData } from '@/lib/http'

export interface ApiFloorVO {
  id: number | string
  create_at: string
  update_at: string
  name: string
  sort_order: number
  status: number
  zone_count: number | string
}

export interface ApiZoneVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  name: string
  floor_id: number | string
  row_start: number
  row_end: number
  sort_order: number
  remark: string | null
  status: number
  floor_name: string
  gate_ids: Array<number | string>
  gate_names: string[]
  open_gate_ids: Array<number | string>
  open_gate_names: string[]
}

export interface ApiGateOptionVO {
  id: number | string
  code: string
  name: string
  open_status: number
  status: number
  match_open: boolean | number
}

interface ApiPage<T> {
  list: T[]
  total: number | string
  page: number
  page_size: number
}

interface ApiFloorCreateRequest {
  name: string
  sort_order: number
  status: 0 | 1
}

interface ApiZoneCreateRequest {
  code: string
  name: string
  floor_id: number
  row_start: number
  row_end: number
  sort_order: number
  remark: string
  status: 0 | 1
  gate_ids: number[]
}

interface ApiZoneImportRequest {
  csv: string
}

interface ApiZoneImportResponse {
  imported: number | string
}

type ApiZoneUpdateRequest = Omit<ApiZoneCreateRequest, 'code'>

export interface SeatPlanningDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

export interface SeatPlanningFileRequester {
  (config: SignedRequestConfig): Promise<AxiosResponse<Blob>>
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

function stringIds(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function flag(value: unknown): boolean {
  return value === true || value === 1
}

function mapStatus(value: unknown): SeatZoneStatus {
  return integer(value, 1) === 0 ? 'disabled' : 'enabled'
}

function mapGateOpenStatus(value: unknown): SeatGateOpenStatus {
  if (integer(value, 1) === 0) return 'closed'
  if (integer(value, 1) === 2) return 'restricted'
  return 'open'
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

function cloneFloor(value: SeatFloor): SeatFloor {
  return { ...value }
}

function cloneZone(value: SeatZone): SeatZone {
  return {
    ...value,
    gateIds: [...value.gateIds],
    gateNames: [...value.gateNames],
    openGateIds: [...value.openGateIds],
    openGateNames: [...value.openGateNames],
  }
}

function cloneGate(value: SeatGateOption): SeatGateOption {
  return { ...value }
}

export function mapApiFloor(value: ApiFloorVO): SeatFloor {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的楼层 ID 不完整')
  return {
    id: String(value.id),
    name: requiredText(value.name, '楼层名称'),
    sortOrder: integer(value.sort_order),
    status: mapStatus(value.status),
    zoneCount: nonNegativeInteger(value.zone_count),
    createdAt: requiredText(value.create_at, '楼层创建时间'),
    updatedAt: requiredText(value.update_at, '楼层更新时间'),
  }
}

export function mapApiZone(value: ApiZoneVO): SeatZone {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的分区 ID 不完整')
  if (value.floor_id === undefined || value.floor_id === null) throw responseError('服务器返回的分区楼层 ID 不完整')
  return {
    id: String(value.id),
    code: requiredText(value.code, '分区编号'),
    name: requiredText(value.name, '分区名称'),
    floorId: String(value.floor_id),
    rowStart: integer(value.row_start),
    rowEnd: integer(value.row_end),
    sortOrder: integer(value.sort_order),
    status: mapStatus(value.status),
    remark: typeof value.remark === 'string' ? value.remark : '',
    gateIds: stringIds(value.gate_ids),
    gateNames: stringList(value.gate_names),
    openGateIds: stringIds(value.open_gate_ids),
    openGateNames: stringList(value.open_gate_names),
    createdAt: requiredText(value.create_at, '分区创建时间'),
    updatedAt: requiredText(value.update_at, '分区更新时间'),
  }
}

export function mapApiGateOption(value: ApiGateOptionVO): SeatGateOption {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的检票口 ID 不完整')
  return {
    id: String(value.id),
    code: requiredText(value.code, '检票口编号'),
    name: requiredText(value.name, '检票口名称'),
    openStatus: mapGateOpenStatus(value.open_status),
    enabled: mapStatus(value.status) === 'enabled',
    matchOpen: flag(value.match_open),
  }
}

function mapZonePage(value: ApiPage<ApiZoneVO>): SeatZonePage {
  return {
    zones: Array.isArray(value.list) ? value.list.map(mapApiZone) : [],
    total: nonNegativeInteger(value.total),
    page: Math.max(1, integer(value.page, 1)),
    pageSize: Math.max(1, integer(value.page_size, 20)),
  }
}

function mapZoneImportResult(value: ApiZoneImportResponse): SeatZoneImportResult {
  const imported = Number(value?.imported)
  if (!Number.isSafeInteger(imported) || imported < 0) throw responseError('服务器返回的导入数量无效')
  return { imported }
}

export function sanitizeSeatFloorInput(input: SeatFloorWriteInput): SeatFloorWriteInput {
  return { name: normalizeText(input.name) }
}

export function sanitizeSeatZoneInput(input: SeatZoneWriteInput): SeatZoneWriteInput {
  return {
    code: normalizeText(input.code).toUpperCase(),
    name: normalizeText(input.name),
    floorId: normalizeText(input.floorId),
    rowStart: Number(input.rowStart),
    rowEnd: Number(input.rowEnd),
    gateIds: [...new Set(input.gateIds.map(normalizeText).filter(Boolean))],
    sortOrder: Number(input.sortOrder),
    status: input.status,
    remark: normalizeText(input.remark),
  }
}

export function validateSeatFloorInput(
  input: SeatFloorWriteInput,
  floors: readonly SeatFloor[] = [],
): SeatFloorValidationResult {
  const value = sanitizeSeatFloorInput(input)
  const issues: SeatFloorValidationIssue[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入楼层名称' })
  else if (Array.from(value.name).length > 20) issues.push({ field: 'name', code: 'too_long', message: '楼层名称不能超过 20 个字符' })
  else if (floors.some(item => identity(item.name) === identity(value.name))) {
    issues.push({ field: 'name', code: 'duplicate', message: '楼层名称不能重复' })
  }
  return { valid: issues.length === 0, issues }
}

export function validateSeatZoneInput(
  input: SeatZoneWriteInput,
  zones: readonly SeatZone[] = [],
  floors: readonly SeatFloor[] = [],
  ticketGates: readonly Pick<SeatGateOption, 'id'>[] = [],
  excludedId?: string,
): SeatZoneValidationResult {
  const value = sanitizeSeatZoneInput(input)
  const issues: SeatZoneValidationIssue[] = []

  if (!value.code) issues.push({ field: 'code', code: 'required', message: '请输入分区编号' })
  else if (!/^[A-Z0-9-]{1,10}$/.test(value.code)) {
    issues.push({ field: 'code', code: 'invalid', message: '分区编号须为 1–10 位字母、数字或连字符' })
  }
  else if (zones.some(item => item.id !== excludedId && identity(item.code) === identity(value.code))) {
    issues.push({ field: 'code', code: 'duplicate', message: '分区编号不能重复' })
  }

  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入区域名称' })
  else if (Array.from(value.name).length > 80) issues.push({ field: 'name', code: 'too_long', message: '区域名称不能超过 80 个字符' })

  if (!value.floorId) issues.push({ field: 'floorId', code: 'required', message: '请选择所属楼层' })
  else if (!floors.some(item => item.id === value.floorId)) issues.push({ field: 'floorId', code: 'not_found', message: '所选楼层不存在' })

  if (!Number.isInteger(value.rowStart) || value.rowStart < 1 || value.rowStart > 200) {
    issues.push({ field: 'rowStart', code: 'invalid', message: '起始排号须为 1–200 的整数' })
  }
  if (!Number.isInteger(value.rowEnd) || value.rowEnd < 1 || value.rowEnd > 200) {
    issues.push({ field: 'rowEnd', code: 'invalid', message: '结束排号须为 1–200 的整数' })
  }
  else if (Number.isInteger(value.rowStart) && value.rowEnd <= value.rowStart) {
    issues.push({ field: 'rowEnd', code: 'invalid', message: '结束排号必须大于起始排号' })
  }

  if (!Number.isInteger(value.sortOrder) || value.sortOrder <= 0) {
    issues.push({ field: 'sortOrder', code: 'positive_integer', message: '排序须为大于 0 的整数' })
  }

  if (value.gateIds.length === 0) issues.push({ field: 'gateIds', code: 'required', message: '请至少选择一个检票口' })
  else {
    const validGateIds = new Set(ticketGates.map(item => item.id))
    if (value.gateIds.some(id => !validGateIds.has(id))) {
      issues.push({ field: 'gateIds', code: 'not_found', message: '所选检票口不存在，请重新选择' })
    }
  }

  if (Array.from(value.remark).length > 300) issues.push({ field: 'remark', code: 'too_long', message: '备注不能超过 300 个字符' })
  return { valid: issues.length === 0, issues }
}

export function sortSeatFloors(floors: readonly SeatFloor[]): SeatFloor[] {
  return [...floors]
    .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name, 'zh-CN', { numeric: true }))
    .map(cloneFloor)
}

export function sortSeatZones(zones: readonly SeatZone[], floors: readonly SeatFloor[]): SeatZone[] {
  const floorOrder = new Map(sortSeatFloors(floors).map((floor, index) => [floor.id, index]))
  return [...zones]
    .sort((first, second) => (floorOrder.get(first.floorId) ?? Number.MAX_SAFE_INTEGER) - (floorOrder.get(second.floorId) ?? Number.MAX_SAFE_INTEGER) ||
      first.sortOrder - second.sortOrder || first.code.localeCompare(second.code, 'zh-CN', { numeric: true }))
    .map(cloneZone)
}

function zoneCreateBody(input: SeatZoneWriteInput): ApiZoneCreateRequest {
  const value = sanitizeSeatZoneInput(input)
  return {
    code: value.code,
    name: value.name,
    floor_id: bodyId(value.floorId),
    row_start: value.rowStart,
    row_end: value.rowEnd,
    sort_order: value.sortOrder,
    remark: value.remark,
    status: value.status === 'enabled' ? 1 : 0,
    gate_ids: value.gateIds.map(bodyId),
  }
}

function zoneUpdateBody(input: SeatZoneWriteInput): ApiZoneUpdateRequest {
  const body = zoneCreateBody(input)
  return {
    name: body.name,
    floor_id: body.floor_id,
    row_start: body.row_start,
    row_end: body.row_end,
    sort_order: body.sort_order,
    remark: body.remark,
    status: body.status,
    gate_ids: body.gate_ids,
  }
}

const defaultFileRequester: SeatPlanningFileRequester = config => rawHttpClient.request<Blob>(config)

export function createSeatPlanningService(
  request: SeatPlanningDataRequester = requestData,
  requestFile: SeatPlanningFileRequester = defaultFileRequester,
): SeatPlanningService {
  return {
    async listFloors() {
      const values = await request<ApiFloorVO[]>({ method: 'GET', url: 'api/v1/admin/floors' })
      return sortSeatFloors(Array.isArray(values) ? values.map(mapApiFloor) : [])
    },

    async createFloor(input: SeatFloorCreateInput) {
      const data: ApiFloorCreateRequest = {
        name: normalizeText(input.name),
        sort_order: input.sortOrder,
        status: input.status === 'enabled' ? 1 : 0,
      }
      return mapApiFloor(await request<ApiFloorVO, ApiFloorCreateRequest>({ method: 'POST', url: 'api/v1/admin/floors', data }))
    },

    async deleteFloor(id: string) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/floors', id) })
    },

    async listZones(page: number, pageSize: number) {
      return mapZonePage(await request<ApiPage<ApiZoneVO>>({
        method: 'GET',
        url: 'api/v1/admin/zones',
        params: { page, page_size: pageSize },
      }))
    },

    async getZone(id: string) {
      return mapApiZone(await request<ApiZoneVO>({ method: 'GET', url: endpoint('api/v1/admin/zones', id) }))
    },

    async createZone(input: SeatZoneWriteInput) {
      const data = zoneCreateBody(input)
      return mapApiZone(await request<ApiZoneVO, ApiZoneCreateRequest>({ method: 'POST', url: 'api/v1/admin/zones', data }))
    },

    async updateZone(id: string, input: SeatZoneWriteInput) {
      const data = zoneUpdateBody(input)
      return mapApiZone(await request<ApiZoneVO, ApiZoneUpdateRequest>({ method: 'PATCH', url: endpoint('api/v1/admin/zones', id), data }))
    },

    async deleteZone(id: string) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/zones', id) })
    },

    async exportCsv() {
      const response = await requestFile({
        method: 'GET',
        url: 'api/v1/admin/zones/export',
        responseType: 'blob',
        headers: { Accept: 'text/csv' },
      })
      return mapCsvExportResponse(response, 'seat_zones.csv')
    },

    async importCsv(csv: string) {
      const data: ApiZoneImportRequest = { csv }
      return mapZoneImportResult(await request<ApiZoneImportResponse, ApiZoneImportRequest>({
        method: 'POST',
        url: 'api/v1/admin/zones/import',
        data,
      }))
    },

    async listGateOptions() {
      const values = await request<ApiGateOptionVO[]>({ method: 'GET', url: 'api/v1/admin/gates/options' })
      return (Array.isArray(values) ? values.map(mapApiGateOption) : [])
        .sort((first, second) => first.code.localeCompare(second.code, 'zh-CN', { numeric: true }))
        .map(cloneGate)
    },
  }
}

export const seatPlanningService = createSeatPlanningService()
