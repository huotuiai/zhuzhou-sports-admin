export const INTEGRATION_SOURCE_TYPE_VALUES = [
  'parking',
  'yun720',
  'host_activity',
  'police_control',
  'shuttle',
] as const

export type IntegrationSourceType = typeof INTEGRATION_SOURCE_TYPE_VALUES[number]
export type WritableIntegrationSourceType = Extract<IntegrationSourceType, 'parking' | 'yun720'>
export type IntegrationSyncStatus = 'success' | 'fail' | 'none'
export type IntegrationSyncResultStatus = 'success' | 'fail'

export const INTEGRATION_SOURCE_TYPE_LABELS: Record<IntegrationSourceType, string> = {
  parking: '停车场',
  yun720: '720 云 VR',
  host_activity: '主办方活动',
  police_control: '交警管制',
  shuttle: '接驳车',
}

export const INTEGRATION_SYNC_STATUS_LABELS: Record<IntegrationSyncStatus, string> = {
  success: '成功',
  fail: '失败',
  none: '未同步',
}

export interface IntegrationSource {
  id: string
  code: string
  name: string
  sourceType: IntegrationSourceType
  apiUrl: string
  intervalMinutes: number
  lastSyncAt: string | null
  lastSyncStatus: IntegrationSyncStatus
  consecutiveFailures: number
  enabled: boolean
  remark: string
  apiKeyMasked: string
  createdAt: string
  updatedAt: string
}

export interface IntegrationSourcePage {
  items: IntegrationSource[]
  total: number
  page: number
  pageSize: number
}

export interface IntegrationSourceQuery {
  keyword: string
  sourceType: 'all' | IntegrationSourceType
}

export interface IntegrationSourceWriteInput {
  name: string
  sourceType: IntegrationSourceType
  apiUrl: string
  apiKey: string
  intervalMinutes: number
  enabled: boolean
  remark: string
}

export interface IntegrationSyncLog {
  id: string
  sourceId: string
  startedAt: string
  finishedAt: string | null
  result: IntegrationSyncResultStatus
  summary: string | null
  failureReason: string | null
  durationMs: number | null
  createdAt: string
  updatedAt: string
}

export interface IntegrationSyncLogPage {
  items: IntegrationSyncLog[]
  total: number
  page: number
  pageSize: number
}

export interface IntegrationSyncLogQuery {
  sourceId: string
  result: 'all' | IntegrationSyncResultStatus
}

export interface IntegrationSyncResult {
  sourceId: string
  result: IntegrationSyncResultStatus
  summary: string
  disabled: boolean
}

export interface IntegrationSourceReference {
  code: string
  name: string
}

export interface IntegrationService {
  listSources(query: IntegrationSourceQuery, page: number, pageSize: number): Promise<IntegrationSourcePage>
  getSource(id: string): Promise<IntegrationSource>
  createSource(input: IntegrationSourceWriteInput): Promise<IntegrationSource>
  updateSource(id: string, input: IntegrationSourceWriteInput): Promise<IntegrationSource>
  syncSource(id: string): Promise<IntegrationSyncResult>
  listSyncLogs(query: IntegrationSyncLogQuery, page: number, pageSize: number): Promise<IntegrationSyncLogPage>
}

export function isWritableIntegrationSourceType(value: IntegrationSourceType): value is WritableIntegrationSourceType {
  return value === 'parking' || value === 'yun720'
}

export function integrationSourceTypeLabel(value: IntegrationSourceType): string {
  return INTEGRATION_SOURCE_TYPE_LABELS[value]
}
