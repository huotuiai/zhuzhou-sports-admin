import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type {
  DashboardActivityOption,
  DashboardDatePreset,
  DashboardDateRange,
  DashboardDistribution,
  DashboardDistributionSlice,
  DashboardExportFile,
  DashboardMetric,
  DashboardMetricDetail,
  DashboardMetricGroup,
  DashboardOperationsResult,
  DashboardService,
  DashboardSnapshot,
  DashboardStatsQuery,
  DashboardTrendPoint,
  DashboardVrSyncResult,
  MetricDetailPage,
  ParkingUsageItem,
  VrWorkMetric,
} from '../types'
import { ApiError, rawHttpClient, requestData } from '@/lib/http'

type ApiRangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom'

export interface ApiTimeWindow {
  preset: string
  start: string
  end: string
}

export interface ApiActivityOption {
  id: number | string
  title: string
  activity_start_at: string | null
  activity_end_at: string | null
}

export interface ApiKpiCard {
  code: string
  name: string
  hint: string
  group: string
  value: number | string
  uv: number | string | null
  prev: number | string
  change: number | string | null
  change_text: string
}

export interface ApiOverviewVO {
  window: ApiTimeWindow
  activities: ApiActivityOption[]
  entry: ApiKpiCard[]
  page: ApiKpiCard[]
  as_of: string
}

export interface ApiTrendPoint {
  day: string
  value: number | string
  uv: number | string | null
}

export interface ApiAnalyticsEvent {
  id: number | string
  create_at: string
  update_at: string
  occurred_at: string
  event_name: string
  device_id: string | null
  page: string | null
  ref_type: string | null
  ref_id: number | string | null
  extra_json: string | null
  ip: string | null
}

export interface ApiAnalyticsEventPage {
  list: ApiAnalyticsEvent[]
  total: number | string
  page: number | string
  page_size: number | string
}

export interface ApiDistSlice {
  name: string
  value: number | string
}

export interface ApiParkingBar {
  name: string
  remain: number | string
  capacity: number | string
  usage: number | string
}

export interface ApiDistributionVO {
  parking_fee: ApiDistSlice[]
  parking_remain: ApiParkingBar[]
  controls: ApiDistSlice[]
  activities: ApiDistSlice[]
}

export interface ApiVrWork {
  id: number | string
  create_at: string
  update_at: string
  external_id: string
  title: string
  cover_url: string | null
  bind_object: string | null
  pv_count: number | string
  like_count: number | string
  scene_count: number | string
  uv_count: number | string | null
  share_count: number | string | null
  comment_count: number | string | null
  phone_click_count: number | string | null
  last_sync_at: string | null
  is_invalid: number | boolean
  status: number | boolean
}

export interface ApiVrSyncResult {
  source_id: number | string
  result: string
  summary: string
  disabled: boolean
}

export interface DashboardDataRequester {
  <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T>
}

export interface DashboardFileRequester {
  (config: SignedRequestConfig): Promise<AxiosResponse<Blob>>
}

export class DashboardServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DashboardServiceError'
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_DETAIL_PAGE_SIZE = 100

function responseError(message: string): ApiError {
  return new ApiError(message, { kind: 'response' })
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw responseError(`服务器返回的${field}不完整`)
  return value
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberValue(value: unknown, field: string): number {
  const result = Number(value)
  if (!Number.isFinite(result)) throw responseError(`服务器返回的${field}无效`)
  return result
}

function nonNegativeInteger(value: unknown, field: string): number {
  return Math.max(0, Math.trunc(numberValue(value, field)))
}

function nullableNonNegativeInteger(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : nonNegativeInteger(value, field)
}

function flag(value: unknown): boolean {
  return value === true || value === 1
}

export function toDashboardDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDashboardDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new DashboardServiceError('日期格式无效')
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime()) || toDashboardDate(date) !== value) throw new DashboardServiceError('日期格式无效')
  return date
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function normalizeDashboardRange(range: DashboardDateRange, now = new Date()): DashboardDateRange {
  const start = parseDashboardDate(range.start)
  const requestedEnd = parseDashboardDate(range.end)
  const today = parseDashboardDate(toDashboardDate(now))
  const end = requestedEnd > today ? today : requestedEnd
  if (start > end) throw new DashboardServiceError('结束日期不能早于开始日期')
  const span = Math.floor((end.getTime() - start.getTime()) / 86_400_000)
  if (span > 365) throw new DashboardServiceError('数据量过大，建议将时间范围缩小到一年以内')
  return { start: toDashboardDate(start), end: toDashboardDate(end) }
}

export function rangeForPreset(preset: Exclude<DashboardDatePreset, 'custom'>, now = new Date()): DashboardDateRange {
  const today = parseDashboardDate(toDashboardDate(now))
  if (preset === 'today') return { start: toDashboardDate(today), end: toDashboardDate(today) }
  if (preset === 'yesterday') {
    const yesterday = addDays(today, -1)
    return { start: toDashboardDate(yesterday), end: toDashboardDate(yesterday) }
  }
  const days = preset === 'last-30-days' ? 30 : 7
  return { start: toDashboardDate(addDays(today, -(days - 1))), end: toDashboardDate(today) }
}

export function queryForPreset(preset: Exclude<DashboardDatePreset, 'custom'>, now = new Date()): DashboardStatsQuery {
  return { preset, activityId: '', ...rangeForPreset(preset, now) }
}

function apiPreset(preset: DashboardDatePreset): ApiRangePreset {
  if (preset === 'last-7-days') return '7d'
  if (preset === 'last-30-days') return '30d'
  return preset
}

export function dashboardQueryParams(query: DashboardStatsQuery): Record<string, string> {
  if (query.activityId) return { activity_id: query.activityId }
  if (query.preset === 'custom') {
    const range = normalizeDashboardRange(query)
    return { range: 'custom', start: range.start, end: range.end }
  }
  return { range: apiPreset(query.preset) }
}

function shanghaiDate(value: string, offsetMs = 0): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw responseError('服务器返回的统计时间窗无效')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(date.getTime() + offsetMs))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function mapApiTimeWindow(value: ApiTimeWindow): DashboardDateRange {
  return { start: shanghaiDate(requiredText(value.start, '统计开始时间')), end: shanghaiDate(requiredText(value.end, '统计结束时间'), -1) }
}

function activityDate(value: string | null): string | null {
  return value ? shanghaiDate(value) : null
}

export function mapApiActivity(value: ApiActivityOption): DashboardActivityOption {
  if (value.id === null || value.id === undefined) throw responseError('服务器返回的活动 ID 不完整')
  return {
    id: String(value.id),
    name: requiredText(value.title, '活动标题'),
    start: activityDate(value.activity_start_at),
    end: activityDate(value.activity_end_at),
  }
}

function metricGroup(value: unknown): DashboardMetricGroup {
  if (value === 'entry' || value === 'page') return value
  throw responseError('服务器返回的指标分组无效')
}

export function mapApiMetric(value: ApiKpiCard, updatedAt: string): DashboardMetric {
  const id = requiredText(value.code, '指标编码')
  const group = metricGroup(value.group)
  const secondaryValue = nullableNonNegativeInteger(value.uv, '指标 UV')
  return {
    id,
    group,
    name: requiredText(value.name, '指标名称'),
    definition: nullableText(value.hint) ?? '',
    source: '统计埋点',
    primaryLabel: id === 'IND-2' ? 'UV' : 'PV',
    primaryValue: nonNegativeInteger(value.value, '指标值'),
    secondaryLabel: secondaryValue === null ? null : 'UV',
    secondaryValue,
    previousValue: nonNegativeInteger(value.prev, '上期指标值'),
    comparisonRate: value.change === null || value.change === undefined ? null : numberValue(value.change, '指标环比'),
    comparisonText: nullableText(value.change_text)?.trim() || '—',
    updatedAt,
    trend: [],
  }
}

export function mapApiOverview(value: ApiOverviewVO, query: DashboardStatsQuery): DashboardOperationsResult {
  const updatedAt = requiredText(value.as_of, '统计计算时间')
  const entry = Array.isArray(value.entry) ? value.entry.map(item => mapApiMetric(item, updatedAt)) : []
  const page = Array.isArray(value.page) ? value.page.map(item => mapApiMetric(item, updatedAt)) : []
  return {
    activities: Array.isArray(value.activities) ? value.activities.map(mapApiActivity) : [],
    operations: {
      query: { ...query },
      range: mapApiTimeWindow(value.window),
      metrics: [...entry, ...page],
      updatedAt,
    },
  }
}

export function mapApiTrend(value: ApiTrendPoint): DashboardTrendPoint {
  const date = requiredText(value.day, '趋势日期')
  if (!DATE_PATTERN.test(date)) throw responseError('服务器返回的趋势日期无效')
  return {
    date,
    primary: nonNegativeInteger(value.value, '趋势主值'),
    secondary: nullableNonNegativeInteger(value.uv, '趋势 UV'),
  }
}

export function mapApiAnalyticsEvent(value: ApiAnalyticsEvent): DashboardMetricDetail {
  if (value.id === null || value.id === undefined) throw responseError('服务器返回的埋点 ID 不完整')
  return {
    id: String(value.id),
    occurredAt: requiredText(value.occurred_at, '事件发生时间'),
    eventName: requiredText(value.event_name, '埋点名称'),
    deviceId: nullableText(value.device_id),
    page: nullableText(value.page),
    referenceType: nullableText(value.ref_type),
    referenceId: value.ref_id === null || value.ref_id === undefined ? null : String(value.ref_id),
    extraJson: nullableText(value.extra_json),
    ip: nullableText(value.ip),
    createdAt: requiredText(value.create_at, '埋点创建时间'),
    updatedAt: requiredText(value.update_at, '埋点更新时间'),
  }
}

export function mapApiMetricPage(value: ApiAnalyticsEventPage): MetricDetailPage {
  return {
    items: Array.isArray(value.list) ? value.list.map(mapApiAnalyticsEvent) : [],
    total: nonNegativeInteger(value.total, '埋点总数'),
    page: Math.max(1, nonNegativeInteger(value.page, '埋点页码')),
    pageSize: Math.max(1, nonNegativeInteger(value.page_size, '埋点每页条数')),
  }
}

function sliceTone(distributionId: string, label: string, index: number): DashboardDistributionSlice['tone'] {
  if (/免费|已发布|上架/.test(label)) return distributionId === 'activity-status' ? 'primary' : 'success'
  if (/收费/.test(label)) return 'warning'
  if (/撤销|下架/.test(label)) return 'danger'
  if (/草稿/.test(label)) return 'muted'
  return (['primary', 'success', 'warning', 'muted'] as const)[index % 4]
}

function mapSlices(id: string, values: readonly ApiDistSlice[]): DashboardDistributionSlice[] {
  return values.map((item, index) => {
    const label = requiredText(item.name, '分布名称')
    return { key: `${id}-${index + 1}`, label, value: nonNegativeInteger(item.value, '分布数量'), tone: sliceTone(id, label, index) }
  })
}

function distribution(id: string, title: string, description: string, values: readonly ApiDistSlice[]): DashboardDistribution {
  const slices = mapSlices(id, values)
  return { id, title, description, kind: 'donut', centerText: `${slices.reduce((sum, item) => sum + item.value, 0)} 项`, slices }
}

export function mapApiDistribution(value: ApiDistributionVO): { distributions: DashboardDistribution[], parkingUsage: ParkingUsageItem[] } {
  const distributions = [
    distribution('parking-charge', '停车收费类型分布', '当前停车区配置', Array.isArray(value.parking_fee) ? value.parking_fee : []),
    distribution('control-status', '管制状态分布', '当前交通管制状态', Array.isArray(value.controls) ? value.controls : []),
    distribution('activity-status', '活动状态分布', '当前活动上下架状态', Array.isArray(value.activities) ? value.activities : []),
  ]
  const parkingUsage = (Array.isArray(value.parking_remain) ? value.parking_remain : []).map((item, index) => {
    const total = nonNegativeInteger(item.capacity, '停车场总车位')
    const available = nonNegativeInteger(item.remain, '停车场余位')
    const usage = Math.min(1, Math.max(0, numberValue(item.usage, '停车场占用率')))
    return {
      id: `parking-${index + 1}`,
      name: requiredText(item.name, '停车场名称'),
      total,
      used: Math.max(0, total - available),
      available,
      usageRate: Math.round(usage * 1000) / 10,
    }
  })
  return { distributions, parkingUsage }
}

export function mapApiVrWork(value: ApiVrWork): Omit<VrWorkMetric, 'rank'> {
  if (value.id === null || value.id === undefined) throw responseError('服务器返回的 VR 作品 ID 不完整')
  return {
    id: String(value.id),
    externalId: requiredText(value.external_id, 'VR 外部 ID'),
    title: requiredText(value.title, 'VR 标题'),
    coverUrl: nullableText(value.cover_url),
    bindingObject: nullableText(value.bind_object),
    pv: nonNegativeInteger(value.pv_count, 'VR 浏览量'),
    uv: nullableNonNegativeInteger(value.uv_count, 'VR UV'),
    likes: nonNegativeInteger(value.like_count, 'VR 点赞数'),
    shares: nullableNonNegativeInteger(value.share_count, 'VR 分享数'),
    comments: nullableNonNegativeInteger(value.comment_count, 'VR 评论数'),
    phoneClicks: nullableNonNegativeInteger(value.phone_click_count, 'VR 电话点击数'),
    sceneCount: nonNegativeInteger(value.scene_count, 'VR 场景数'),
    lastSyncedAt: nullableText(value.last_sync_at),
    isInvalid: flag(value.is_invalid),
    enabled: flag(value.status),
    createdAt: requiredText(value.create_at, 'VR 创建时间'),
    updatedAt: requiredText(value.update_at, 'VR 更新时间'),
  }
}

export function mapApiVrWorks(values: readonly ApiVrWork[]): VrWorkMetric[] {
  return values.map(mapApiVrWork)
    .sort((first, second) => second.pv - first.pv || first.title.localeCompare(second.title, 'zh-CN'))
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

export function mapApiVrSync(value: ApiVrSyncResult): DashboardVrSyncResult {
  if (value.source_id === null || value.source_id === undefined) throw responseError('服务器返回的对接源 ID 不完整')
  if (value.result !== 'success' && value.result !== 'fail') throw responseError('服务器返回的同步结果无效')
  return {
    sourceId: String(value.source_id),
    result: value.result,
    summary: requiredText(value.summary, '同步摘要'),
    disabled: value.disabled === true,
  }
}

function safeFilename(value: string): string {
  const sanitized = Array.from(value, character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127 ? '_' : character).join('')
  return sanitized.replace(/[\\/]/g, '_').trim() || 'stats_details.csv'
}

function headerValue(response: AxiosResponse, name: string): string | null {
  const direct = response.headers?.[name]
  if (typeof direct === 'string') return direct
  const headers = response.headers as { get?: (headerName: string) => unknown }
  const result = typeof headers.get === 'function' ? headers.get(name) : null
  return typeof result === 'string' ? result : null
}

export function dashboardExportFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return 'stats_details.csv'
  const encoded = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try { return safeFilename(decodeURIComponent(encoded.replace(/^"|"$/g, ''))) }
    catch { /* Use the plain filename fallback. */ }
  }
  const plain = contentDisposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i)
  return safeFilename((plain?.[1] ?? plain?.[2] ?? 'stats_details.csv').trim())
}

const defaultFileRequester: DashboardFileRequester = config => rawHttpClient.request<Blob>(config)

export function createDashboardService(
  request: DashboardDataRequester = requestData,
  requestFile: DashboardFileRequester = defaultFileRequester,
): DashboardService {
  const service: DashboardService = {
    async loadDashboard(query): Promise<DashboardSnapshot> {
      const [overview, distributionResult, vrWorks] = await Promise.all([
        service.loadOperations(query), service.loadDistributions(), service.loadVrWorks(),
      ])
      return {
        activities: overview.activities,
        operations: overview.operations,
        distributions: distributionResult.distributions,
        parkingUsage: distributionResult.parkingUsage,
        vrWorks,
        currentDataUpdatedAt: overview.operations.updatedAt,
      }
    },

    async loadOperations(query) {
      const result = await request<ApiOverviewVO>({ method: 'GET', url: 'api/v1/admin/stats/overview', params: dashboardQueryParams(query) })
      return mapApiOverview(result, query)
    },

    async loadMetricTrend(metricId, query) {
      const result = await request<ApiTrendPoint[]>({
        method: 'GET', url: 'api/v1/admin/stats/trend', params: { code: metricId, ...dashboardQueryParams(query) },
      })
      return Array.isArray(result) ? result.map(mapApiTrend) : []
    },

    async getMetricDetails(metricId, query, page, pageSize) {
      const result = await request<ApiAnalyticsEventPage>({
        method: 'GET', url: 'api/v1/admin/stats/details',
        params: {
          page: Math.max(1, Math.trunc(page) || 1),
          page_size: Math.min(MAX_DETAIL_PAGE_SIZE, Math.max(1, Math.trunc(pageSize) || 20)),
          code: metricId,
          ...dashboardQueryParams(query),
        },
      })
      return mapApiMetricPage(result)
    },

    async exportMetricDetails(metricId, query): Promise<DashboardExportFile> {
      const response = await requestFile({
        method: 'GET', url: 'api/v1/admin/stats/details/export',
        params: { code: metricId, ...dashboardQueryParams(query) }, responseType: 'blob', headers: { Accept: 'text/csv' },
      })
      return { content: response.data, filename: dashboardExportFilename(headerValue(response, 'content-disposition')) }
    },

    async loadDistributions() {
      return mapApiDistribution(await request<ApiDistributionVO>({ method: 'GET', url: 'api/v1/admin/stats/distribution' }))
    },

    async loadVrWorks() {
      const result = await request<ApiVrWork[]>({ method: 'GET', url: 'api/v1/admin/stats/vr-works' })
      return mapApiVrWorks(Array.isArray(result) ? result : [])
    },

    async syncVrWorks() {
      return mapApiVrSync(await request<ApiVrSyncResult>({ method: 'POST', url: 'api/v1/admin/stats/vr-sync', data: {} }))
    },
  }
  return service
}

export const dashboardService = createDashboardService()
