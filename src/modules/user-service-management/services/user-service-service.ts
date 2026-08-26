import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type {
  ContactNumber,
  FeedbackExportFile,
  FeedbackPage,
  FeedbackQuery,
  FeedbackStatus,
  FeedbackType,
  UserFeedback,
  UserServiceService,
} from '../types'
import { ApiError, rawHttpClient, requestData } from '@/lib/http'
import { sanitizeContactNumberInput, sanitizeFeedbackHandleInput } from './user-service-validation'

export interface ApiFeedbackVO {
  id: number | string
  create_at: string
  update_at: string
  code: string
  feedback_type: string
  content: string
  contact: string | null
  handle_status: number
  handler_id: number | string | null
  handled_at: string | null
  handle_remark: string | null
  type_label: string
  handler_name: string | null
}

export interface ApiContactPhone {
  id: number | string
  create_at: string
  update_at: string
  name: string
  phone: string
  sort_order: number
  visible: number
  status: number
}

interface ApiPage<T> {
  list: T[]
  total: number | string
  page: number
  page_size: number
}

interface ApiFeedbackHandleRequest {
  handle_remark: string
}

interface ApiContactWriteRequest {
  name: string
  phone: string
  sort_order: number
  visible: 0 | 1
  status?: 1
}

export interface UserServiceDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

export interface UserServiceFileRequester {
  (config: SignedRequestConfig): Promise<AxiosResponse<Blob>>
}

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw responseError(`服务器返回的${field}不完整`)
  return value
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function integer(value: unknown, fallback = 0): number {
  const result = Number(value)
  return Number.isInteger(result) ? result : fallback
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, integer(value))
}

function endpoint(path: string, id: string, suffix = ''): string {
  return `${path}/${encodeURIComponent(id)}${suffix}`
}

function mapFeedbackType(value: unknown): FeedbackType {
  if (value === 'bug') return 'error'
  if (value === 'suggest') return 'suggestion'
  if (value === 'complain') return 'complaint'
  if (value === 'other') return 'other'
  throw responseError('服务器返回的反馈类型无效')
}

function apiFeedbackType(value: Exclude<FeedbackQuery['type'], 'all'>): string {
  if (value === 'error') return 'bug'
  if (value === 'suggestion') return 'suggest'
  if (value === 'complaint') return 'complain'
  return 'other'
}

function mapFeedbackStatus(value: unknown): FeedbackStatus {
  if (integer(value) === 0) return 'pending'
  if (integer(value) === 1) return 'processed'
  throw responseError('服务器返回的反馈处理状态无效')
}

export function mapApiFeedback(value: ApiFeedbackVO): UserFeedback {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的反馈 ID 不完整')
  return {
    id: String(value.id),
    code: requiredText(value.code, '反馈编号'),
    type: mapFeedbackType(value.feedback_type),
    content: requiredText(value.content, '反馈内容'),
    contact: nullableText(value.contact),
    submittedAt: requiredText(value.create_at, '反馈提交时间'),
    status: mapFeedbackStatus(value.handle_status),
    handlerId: value.handler_id === undefined || value.handler_id === null ? null : String(value.handler_id),
    handlerName: nullableText(value.handler_name)?.trim() || null,
    handledAt: nullableText(value.handled_at),
    handlingRemark: nullableText(value.handle_remark) || '',
  }
}

export function mapApiContact(value: ApiContactPhone): ContactNumber {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的联系电话 ID 不完整')
  return {
    id: String(value.id),
    name: requiredText(value.name, '号码名称'),
    phone: requiredText(value.phone, '联系电话'),
    sort: integer(value.sort_order),
    displayEnabled: integer(value.visible) === 1,
    enabled: integer(value.status) === 1,
    createdAt: requiredText(value.create_at, '联系电话创建时间'),
    updatedAt: requiredText(value.update_at, '联系电话更新时间'),
  }
}

function mapFeedbackPage(value: ApiPage<ApiFeedbackVO>): FeedbackPage {
  return {
    feedbacks: Array.isArray(value.list) ? value.list.map(mapApiFeedback) : [],
    total: nonNegativeInteger(value.total),
    page: Math.max(1, integer(value.page, 1)),
    pageSize: Math.max(1, integer(value.page_size, 20)),
  }
}

function queryParams(query: FeedbackQuery, pagination?: { page: number; pageSize: number }): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (pagination) Object.assign(params, { page: pagination.page, page_size: pagination.pageSize })
  if (query.type !== 'all') params.feedback_type = apiFeedbackType(query.type)
  if (query.status !== 'all') params.handle_status = query.status === 'processed' ? 1 : 0
  if (query.startDate) params.from = query.startDate
  if (query.endDate) params.to = query.endDate
  return params
}

function sortContacts(contacts: readonly ContactNumber[]): ContactNumber[] {
  return [...contacts].sort((first, second) => first.sort - second.sort || first.createdAt.localeCompare(second.createdAt))
}

function headerValue(response: AxiosResponse, name: string): string | null {
  const direct = response.headers?.[name]
  if (typeof direct === 'string') return direct
  const headers = response.headers as { get?: (headerName: string) => unknown }
  const getter = typeof headers.get === 'function' ? headers.get(name) : null
  return typeof getter === 'string' ? getter : null
}

function safeFilename(value: string): string {
  const withoutControls = Array.from(value, character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127 ? '_' : character).join('')
  return withoutControls.replace(/[\\/]/g, '_').trim() || 'feedbacks.csv'
}

export function feedbackExportFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return 'feedbacks.csv'
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
  return safeFilename((plain?.[1] ?? plain?.[2] ?? 'feedbacks.csv').trim())
}

const defaultFileRequester: UserServiceFileRequester = config => rawHttpClient.request<Blob>(config)

export function createUserService(
  request: UserServiceDataRequester = requestData,
  requestFile: UserServiceFileRequester = defaultFileRequester,
): UserServiceService {
  return {
    async listFeedbacks(query, page, pageSize) {
      return mapFeedbackPage(await request<ApiPage<ApiFeedbackVO>>({
        method: 'GET',
        url: 'api/v1/admin/feedbacks',
        params: queryParams(query, { page, pageSize }),
      }))
    },

    async getFeedback(id) {
      return mapApiFeedback(await request<ApiFeedbackVO>({
        method: 'GET',
        url: endpoint('api/v1/admin/feedbacks', id),
      }))
    },

    async handleFeedback(id, input) {
      const data: ApiFeedbackHandleRequest = { handle_remark: sanitizeFeedbackHandleInput(input).remark }
      return mapApiFeedback(await request<ApiFeedbackVO, ApiFeedbackHandleRequest>({
        method: 'POST',
        url: endpoint('api/v1/admin/feedbacks', id, '/handle'),
        data,
      }))
    },

    async exportFeedbacks(query): Promise<FeedbackExportFile> {
      const response = await requestFile({
        method: 'GET',
        url: 'api/v1/admin/feedbacks/export',
        params: queryParams(query),
        responseType: 'blob',
        headers: { Accept: 'text/csv' },
      })
      return {
        content: response.data,
        filename: feedbackExportFilename(headerValue(response, 'content-disposition')),
      }
    },

    async listContacts() {
      const result = await request<ApiContactPhone[]>({ method: 'GET', url: 'api/v1/admin/contacts' })
      return sortContacts(Array.isArray(result) ? result.map(mapApiContact) : [])
    },

    async createContact(input) {
      const value = sanitizeContactNumberInput(input)
      const data: ApiContactWriteRequest = {
        name: value.name,
        phone: value.phone,
        sort_order: value.sort,
        visible: value.displayEnabled ? 1 : 0,
        status: 1,
      }
      return mapApiContact(await request<ApiContactPhone, ApiContactWriteRequest>({
        method: 'POST', url: 'api/v1/admin/contacts', data,
      }))
    },

    async updateContact(id, input) {
      const value = sanitizeContactNumberInput(input)
      const data: ApiContactWriteRequest = {
        name: value.name,
        phone: value.phone,
        sort_order: value.sort,
        visible: value.displayEnabled ? 1 : 0,
      }
      return mapApiContact(await request<ApiContactPhone, ApiContactWriteRequest>({
        method: 'PATCH', url: endpoint('api/v1/admin/contacts', id), data,
      }))
    },

    async deleteContact(id) {
      await request<{ deleted: boolean }>({ method: 'DELETE', url: endpoint('api/v1/admin/contacts', id) })
    },
  }
}

export const userServiceService = createUserService()
