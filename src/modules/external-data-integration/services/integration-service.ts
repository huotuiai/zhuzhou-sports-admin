import type { SignedRequestConfig } from '@/lib/http'
import type {
  IntegrationService,
  IntegrationSource,
  IntegrationSourcePage,
  IntegrationSourceQuery,
  IntegrationSourceType,
  IntegrationSourceWriteInput,
  IntegrationSyncLog,
  IntegrationSyncLogPage,
  IntegrationSyncLogQuery,
  IntegrationSyncResult,
  IntegrationSyncResultStatus,
  IntegrationSyncStatus,
} from '../types'
import { ApiError, requestData } from '@/lib/http'
import { INTEGRATION_SOURCE_TYPE_VALUES } from '../types'

export interface ApiIntegrationSource {
  id: number | string
  create_at: string
  update_at: string
  code: string
  name: string
  source_type: string
  api_url: string
  interval_minutes: number | string
  last_sync_at: string | null
  last_sync_status: string | null
  consecutive_fail: number | string
  status: number | boolean
  remark: string | null
  api_key_masked: string
}

export interface ApiIntegrationSyncLog {
  id: number | string
  create_at: string
  update_at: string
  source_id: number | string
  started_at: string
  finished_at: string | null
  result: string
  summary: string | null
  fail_reason: string | null
  duration_ms: number | string | null
}

export interface ApiIntegrationSyncResult {
  source_id: number | string
  result: string
  summary: string
  disabled: boolean
}

interface ApiPage<T> {
  list: T[]
  total: number | string
  page: number | string
  page_size: number | string
}

export interface IntegrationDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw responseError(`服务器返回的${field}不完整`)
  return value
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nonNegativeInteger(value: unknown, field: string): number {
  const result = Number(value)
  if (!Number.isFinite(result)) throw responseError(`服务器返回的${field}无效`)
  return Math.max(0, Math.trunc(result))
}

function positiveInteger(value: unknown, field: string): number {
  return Math.max(1, nonNegativeInteger(value, field))
}

function flag(value: unknown): boolean {
  return value === true || value === 1
}

function sourceType(value: unknown): IntegrationSourceType {
  if (typeof value === 'string' && (INTEGRATION_SOURCE_TYPE_VALUES as readonly string[]).includes(value)) {
    return value as IntegrationSourceType
  }
  throw responseError('服务器返回的对接源类型无效')
}

function syncStatus(value: unknown): IntegrationSyncStatus {
  if (value === null || value === undefined || value === '' || value === 'none') return 'none'
  if (value === 'success' || value === 'fail') return value
  throw responseError('服务器返回的同步状态无效')
}

function syncResultStatus(value: unknown): IntegrationSyncResultStatus {
  if (value === 'success' || value === 'fail') return value
  throw responseError('服务器返回的同步结果无效')
}

export function mapApiIntegrationSource(value: ApiIntegrationSource): IntegrationSource {
  if (value.id === null || value.id === undefined) throw responseError('服务器返回的对接源 ID 不完整')
  return {
    id: String(value.id),
    code: requiredText(value.code, '对接源编号'),
    name: requiredText(value.name, '对接源名称'),
    sourceType: sourceType(value.source_type),
    apiUrl: text(value.api_url),
    intervalMinutes: nonNegativeInteger(value.interval_minutes, '同步频率'),
    lastSyncAt: nullableText(value.last_sync_at),
    lastSyncStatus: syncStatus(value.last_sync_status),
    consecutiveFailures: nonNegativeInteger(value.consecutive_fail, '连续失败次数'),
    enabled: flag(value.status),
    remark: nullableText(value.remark) ?? '',
    apiKeyMasked: text(value.api_key_masked),
    createdAt: requiredText(value.create_at, '对接源创建时间'),
    updatedAt: requiredText(value.update_at, '对接源更新时间'),
  }
}

function mapSourcePage(value: ApiPage<ApiIntegrationSource>): IntegrationSourcePage {
  return {
    items: Array.isArray(value.list) ? value.list.map(mapApiIntegrationSource) : [],
    total: nonNegativeInteger(value.total, '对接源总数'),
    page: positiveInteger(value.page, '对接源页码'),
    pageSize: positiveInteger(value.page_size, '对接源每页条数'),
  }
}

export function mapApiIntegrationSyncLog(value: ApiIntegrationSyncLog): IntegrationSyncLog {
  if (value.id === null || value.id === undefined) throw responseError('服务器返回的同步日志 ID 不完整')
  if (value.source_id === null || value.source_id === undefined) throw responseError('服务器返回的对接源 ID 不完整')
  return {
    id: String(value.id),
    sourceId: String(value.source_id),
    startedAt: requiredText(value.started_at, '同步开始时间'),
    finishedAt: nullableText(value.finished_at),
    result: syncResultStatus(value.result),
    summary: nullableText(value.summary),
    failureReason: nullableText(value.fail_reason),
    durationMs: value.duration_ms === null || value.duration_ms === undefined
      ? null
      : nonNegativeInteger(value.duration_ms, '同步耗时'),
    createdAt: requiredText(value.create_at, '同步日志创建时间'),
    updatedAt: requiredText(value.update_at, '同步日志更新时间'),
  }
}

function mapLogPage(value: ApiPage<ApiIntegrationSyncLog>): IntegrationSyncLogPage {
  return {
    items: Array.isArray(value.list) ? value.list.map(mapApiIntegrationSyncLog) : [],
    total: nonNegativeInteger(value.total, '同步日志总数'),
    page: positiveInteger(value.page, '同步日志页码'),
    pageSize: positiveInteger(value.page_size, '同步日志每页条数'),
  }
}

export function mapApiIntegrationSyncResult(value: ApiIntegrationSyncResult): IntegrationSyncResult {
  if (value.source_id === null || value.source_id === undefined) throw responseError('服务器返回的对接源 ID 不完整')
  return {
    sourceId: String(value.source_id),
    result: syncResultStatus(value.result),
    summary: requiredText(value.summary, '同步摘要'),
    disabled: value.disabled === true,
  }
}

function sourceQueryParams(
  query: IntegrationSourceQuery,
  page: number,
  pageSize: number,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page: Math.max(1, Math.trunc(page) || 1),
    page_size: Math.min(100, Math.max(1, Math.trunc(pageSize) || 20)),
  }
  const keyword = query.keyword.trim().normalize('NFKC')
  if (keyword) params.keyword = keyword
  if (query.sourceType !== 'all') params.source_type = query.sourceType
  return params
}

function logQueryParams(
  query: IntegrationSyncLogQuery,
  page: number,
  pageSize: number,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page: Math.max(1, Math.trunc(page) || 1),
    page_size: Math.min(100, Math.max(1, Math.trunc(pageSize) || 20)),
  }
  if (query.sourceId) params.source_id = query.sourceId
  if (query.result !== 'all') params.result = query.result
  return params
}

function writeBody(input: IntegrationSourceWriteInput): Record<string, string | number> {
  const body: Record<string, string | number> = {
    name: input.name.trim(),
    source_type: input.sourceType,
    api_url: input.apiUrl.trim(),
    interval_minutes: Math.trunc(input.intervalMinutes),
    status: input.enabled ? 1 : 0,
    remark: input.remark.trim(),
  }
  const apiKey = input.apiKey.trim()
  if (apiKey) body.api_key = apiKey
  return body
}

export function createIntegrationService(request: IntegrationDataRequester = requestData): IntegrationService {
  return {
    async listSources(query, page, pageSize) {
      return mapSourcePage(await request<ApiPage<ApiIntegrationSource>>({
        method: 'GET',
        url: 'api/v1/admin/integrations',
        params: sourceQueryParams(query, page, pageSize),
      }))
    },

    async getSource(id) {
      return mapApiIntegrationSource(await request<ApiIntegrationSource>({
        method: 'GET',
        url: `api/v1/admin/integrations/${encodeURIComponent(id)}`,
      }))
    },

    async createSource(input) {
      return mapApiIntegrationSource(await request<ApiIntegrationSource>({
        method: 'POST',
        url: 'api/v1/admin/integrations',
        data: writeBody(input),
      }))
    },

    async updateSource(id, input) {
      return mapApiIntegrationSource(await request<ApiIntegrationSource>({
        method: 'PATCH',
        url: `api/v1/admin/integrations/${encodeURIComponent(id)}`,
        data: writeBody(input),
      }))
    },

    async syncSource(id) {
      return mapApiIntegrationSyncResult(await request<ApiIntegrationSyncResult>({
        method: 'POST',
        url: `api/v1/admin/integrations/${encodeURIComponent(id)}/sync`,
        data: {},
      }))
    },

    async listSyncLogs(query, page, pageSize) {
      return mapLogPage(await request<ApiPage<ApiIntegrationSyncLog>>({
        method: 'GET',
        url: 'api/v1/admin/integrations/logs',
        params: logQueryParams(query, page, pageSize),
      }))
    },
  }
}

export const integrationService = createIntegrationService()
