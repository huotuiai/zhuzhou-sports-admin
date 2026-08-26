import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type {
  OperationLog,
  OperationLogExportFile,
  OperationLogPage,
  OperationLogQuery,
  OperationLogResult,
  OperationLogService,
} from '../types'
import { ApiError, rawHttpClient, requestData } from '@/lib/http'

export interface ApiAuditLogVO {
  id: number | string
  create_at: string
  update_at: string
  user_id: number | string | null
  operator_name: string | null
  dept_name: string | null
  module: string | null
  action: string
  resource_type: string | null
  resource_id: number | string | null
  result: string
  detail_json: string | null
  ip: string | null
}

interface ApiPage<T> {
  list: T[]
  total: number | string
  page: number
  page_size: number
}

export interface OperationLogDataRequester {
  <T>(config: SignedRequestConfig): Promise<T>
}

export interface OperationLogFileRequester {
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

function mapResult(value: unknown): OperationLogResult {
  if (value === 'success') return 'success'
  if (value === 'fail') return 'failure'
  throw responseError('服务器返回的操作结果无效')
}

function parseDetails(value: string | null): unknown {
  if (!value?.trim()) return null
  try {
    return JSON.parse(value) as unknown
  }
  catch {
    return value
  }
}

export function mapApiAuditLog(value: ApiAuditLogVO): OperationLog {
  if (value.id === undefined || value.id === null) throw responseError('服务器返回的日志 ID 不完整')
  const operatorId = nullableId(value.user_id)
  const operatorName = nullableText(value.operator_name)?.trim() || (operatorId ? `用户 ${operatorId}` : '系统任务')
  const detailJson = nullableText(value.detail_json)
  return {
    id: String(value.id),
    operatorId,
    operatorName,
    departmentName: nullableText(value.dept_name) || '',
    module: nullableText(value.module) || '',
    action: requiredText(value.action, '操作动作'),
    targetType: nullableText(value.resource_type) || '',
    targetId: nullableId(value.resource_id),
    performedAt: requiredText(value.create_at, '日志创建时间'),
    ipAddress: nullableText(value.ip) || '',
    result: mapResult(value.result),
    detailJson,
    details: parseDetails(detailJson),
  }
}

function mapPage(value: ApiPage<ApiAuditLogVO>): OperationLogPage {
  return {
    logs: Array.isArray(value.list) ? value.list.map(mapApiAuditLog) : [],
    total: nonNegativeInteger(value.total),
    page: Math.max(1, integer(value.page, 1)),
    pageSize: Math.max(1, integer(value.page_size, 20)),
  }
}

function queryParams(query: OperationLogQuery, pagination?: { page: number; pageSize: number }): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (pagination) Object.assign(params, { page: pagination.page, page_size: pagination.pageSize })
  const keyword = query.keyword.trim().normalize('NFKC')
  const module = query.module.trim().normalize('NFKC')
  const action = query.action.trim().normalize('NFKC')
  if (keyword) params.keyword = keyword
  if (module) params.module = module
  if (action) params.action = action
  if (query.result !== 'all') params.result = query.result === 'success' ? 'success' : 'fail'
  if (query.from) params.from = query.from
  if (query.to) params.to = query.to
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
  const normalized = withoutControls.replace(/[\\/]/g, '_').trim()
  return normalized || 'audit_logs.csv'
}

export function auditExportFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return 'audit_logs.csv'
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
  return safeFilename((plain?.[1] ?? plain?.[2] ?? 'audit_logs.csv').trim())
}

const defaultFileRequester: OperationLogFileRequester = config => rawHttpClient.request<Blob>(config)

export function createOperationLogService(
  request: OperationLogDataRequester = requestData,
  requestFile: OperationLogFileRequester = defaultFileRequester,
): OperationLogService {
  return {
    async listLogs(query, page, pageSize) {
      return mapPage(await request<ApiPage<ApiAuditLogVO>>({
        method: 'GET',
        url: 'api/v1/admin/audits',
        params: queryParams(query, { page, pageSize }),
      }))
    },

    async exportLogs(query): Promise<OperationLogExportFile> {
      const response = await requestFile({
        method: 'GET',
        url: 'api/v1/admin/audits/export',
        params: queryParams(query),
        responseType: 'blob',
        headers: { Accept: 'text/csv' },
      })
      return {
        content: response.data,
        filename: auditExportFilename(headerValue(response, 'content-disposition')),
      }
    },
  }
}

export const operationLogService = createOperationLogService()
