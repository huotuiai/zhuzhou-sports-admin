import type { SignedRequestConfig } from '@/lib/http'
import type {
  VrLink,
  VrLinkPage,
  VrLinkQuery,
  VrLinkService,
  VrLinkStatus,
  VrLinkValidationIssue,
  VrLinkValidationResult,
  VrLinkWriteInput,
  VrPlaceOption,
  VrPlaceType,
} from '../types'
import { ApiError, requestData } from '@/lib/http'

export interface ApiVrLinkVO {
  id: number | string
  create_at: string
  update_at: string
  title: string
  vr_url: string
  place_type: string
  place_id: number | string
  status: number | string
  remark: string | null
  place_name: string
  place_type_label: string
}

export interface ApiVrPlaceOptionVO {
  id: number | string
  name: string
  extra?: string | null
}

interface ApiPage<T> {
  list: T[]
  total: number | string
  page: number | string
  page_size: number | string
}

interface ApiVrLinkWriteRequest {
  title: string
  vr_url: string
  place_type: VrPlaceType
  place_id: string
  status: 0 | 1
  remark: string
}

interface ApiVrLinkStatusRequest {
  status: 0 | 1
}

export interface VrLinkDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

export class VrLinkServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'VrLinkServiceError'
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

function integer(value: unknown, fallback = 0): number {
  const result = Number(value)
  return Number.isInteger(result) ? result : fallback
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, integer(value))
}

function endpoint(id: string): string {
  return `api/v1/admin/vr-links/${encodeURIComponent(id)}`
}

export function isVrPlaceType(value: unknown): value is VrPlaceType {
  return value === 'gate' || value === 'parking' || value === 'shuttle_stop'
}

export function isVrLinkStatus(value: unknown): value is VrLinkStatus {
  return value === 'enabled' || value === 'disabled'
}

function mapStatus(value: unknown): VrLinkStatus {
  return integer(value, 1) === 0 ? 'disabled' : 'enabled'
}

function apiStatus(value: VrLinkStatus): 0 | 1 {
  return value === 'enabled' ? 1 : 0
}

function characterCount(value: string): number {
  return Array.from(value).length
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  }
  catch {
    return false
  }
}

export function sanitizeVrLinkInput(input: VrLinkWriteInput): VrLinkWriteInput {
  return {
    title: normalizeText(input.title),
    vrUrl: input.vrUrl.trim(),
    placeType: input.placeType,
    placeId: input.placeId.trim(),
    status: input.status,
    remark: normalizeText(input.remark),
  }
}

export function validateVrLinkInput(input: VrLinkWriteInput): VrLinkValidationResult {
  const value = sanitizeVrLinkInput(input)
  const issues: VrLinkValidationIssue[] = []

  if (!value.title) issues.push({ field: 'title', code: 'required', message: '请输入展示名称' })
  else if (characterCount(value.title) > 128) {
    issues.push({ field: 'title', code: 'too_long', message: '展示名称不能超过 128 个字符' })
  }

  if (!value.vrUrl) issues.push({ field: 'vrUrl', code: 'required', message: '请输入 VR 打开地址' })
  else if (characterCount(value.vrUrl) > 512) {
    issues.push({ field: 'vrUrl', code: 'too_long', message: 'VR 打开地址不能超过 512 个字符' })
  }
  else if (!isHttpUrl(value.vrUrl)) {
    issues.push({ field: 'vrUrl', code: 'invalid', message: 'VR 打开地址须以 http:// 或 https:// 开头' })
  }

  if (!isVrPlaceType(value.placeType)) {
    issues.push({ field: 'placeType', code: 'invalid', message: '请选择有效的地点类型' })
  }
  if (!value.placeId) issues.push({ field: 'placeId', code: 'required', message: '请选择绑定地点' })
  if (!isVrLinkStatus(value.status)) {
    issues.push({ field: 'status', code: 'invalid', message: '请选择有效状态' })
  }

  return { valid: issues.length === 0, issues }
}

export function mapApiVrLink(value: ApiVrLinkVO): VrLink {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的 VR 绑定 ID 不完整')
  if (value.place_id === undefined || value.place_id === null) throw responseError('服务器返回的绑定地点 ID 不完整')
  if (!isVrPlaceType(value.place_type)) throw responseError('服务器返回的地点类型无效')
  return {
    id: String(value.id),
    title: requiredText(value.title, 'VR 展示名称'),
    vrUrl: requiredText(value.vr_url, 'VR 打开地址'),
    placeType: value.place_type,
    placeId: String(value.place_id),
    status: mapStatus(value.status),
    remark: typeof value.remark === 'string' ? value.remark : '',
    placeName: requiredText(value.place_name, '绑定地点名称'),
    placeTypeLabel: requiredText(value.place_type_label, '地点类型名称'),
    createdAt: requiredText(value.create_at, 'VR 绑定创建时间'),
    updatedAt: requiredText(value.update_at, 'VR 绑定更新时间'),
  }
}

export function mapApiVrPlaceOption(value: ApiVrPlaceOptionVO): VrPlaceOption {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的地点 ID 不完整')
  return {
    id: String(value.id),
    name: requiredText(value.name, '地点名称'),
    extra: typeof value.extra === 'string' ? value.extra : '',
    available: true,
  }
}

function mapPage(value: ApiPage<ApiVrLinkVO>): VrLinkPage {
  return {
    records: Array.isArray(value.list) ? value.list.map(mapApiVrLink) : [],
    total: nonNegativeInteger(value.total),
    page: Math.max(1, integer(value.page, 1)),
    pageSize: Math.max(1, integer(value.page_size, 20)),
  }
}

function filterParameters(query: VrLinkQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  const keyword = normalizeText(query.keyword)
  if (keyword) params.keyword = keyword
  if (query.placeType !== 'all') params.place_type = query.placeType
  if (query.status !== 'all') params.status = apiStatus(query.status)
  return params
}

function writeBody(input: VrLinkWriteInput): ApiVrLinkWriteRequest {
  const value = sanitizeVrLinkInput(input)
  return {
    title: value.title,
    vr_url: value.vrUrl,
    place_type: value.placeType,
    place_id: value.placeId,
    status: apiStatus(value.status),
    remark: value.remark,
  }
}

export function createVrLinkService(request: VrLinkDataRequester = requestData): VrLinkService {
  return {
    async listPage(page, pageSize, query) {
      return mapPage(await request<ApiPage<ApiVrLinkVO>>({
        method: 'GET',
        url: 'api/v1/admin/vr-links',
        params: { page, page_size: pageSize, ...filterParameters(query) },
      }))
    },

    async listPlaceOptions(placeType) {
      if (!isVrPlaceType(placeType)) throw new VrLinkServiceError('请选择有效的地点类型')
      const values = await request<ApiVrPlaceOptionVO[]>({
        method: 'GET',
        url: 'api/v1/admin/vr-links/place-options',
        params: { place_type: placeType },
      })
      return Array.isArray(values) ? values.map(mapApiVrPlaceOption) : []
    },

    async get(id) {
      return mapApiVrLink(await request<ApiVrLinkVO>({ method: 'GET', url: endpoint(id) }))
    },

    async create(input) {
      const validation = validateVrLinkInput(input)
      if (!validation.valid) throw new VrLinkServiceError(validation.issues[0]!.message)
      const data = writeBody(input)
      return mapApiVrLink(await request<ApiVrLinkVO, ApiVrLinkWriteRequest>({
        method: 'POST',
        url: 'api/v1/admin/vr-links',
        data,
      }))
    },

    async update(id, input) {
      const validation = validateVrLinkInput(input)
      if (!validation.valid) throw new VrLinkServiceError(validation.issues[0]!.message)
      const data = writeBody(input)
      return mapApiVrLink(await request<ApiVrLinkVO, ApiVrLinkWriteRequest>({
        method: 'PATCH',
        url: endpoint(id),
        data,
      }))
    },

    async updateStatus(id, status) {
      if (!isVrLinkStatus(status)) throw new VrLinkServiceError('请选择有效状态')
      const data: ApiVrLinkStatusRequest = { status: apiStatus(status) }
      return mapApiVrLink(await request<ApiVrLinkVO, ApiVrLinkStatusRequest>({
        method: 'PATCH',
        url: endpoint(id),
        data,
      }))
    },

    async remove(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint(id) })
    },
  }
}

export const vrLinkService = createVrLinkService()
