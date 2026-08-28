import type { MapGeometry } from '@/components/map/types'

export type TrafficControlType = 'road-closure' | 'restriction' | 'detour' | 'temporary' | 'other'
export type TrafficControlTimeStatus = 'upcoming' | 'active' | 'ended'
export type TrafficControlPublishStatus = 'draft' | 'published' | 'revoked'
export type TrafficControlDataSource = 'manual' | 'sync'

export interface TrafficControlOverlap {
  kind: string
  id: string
  name: string
}

export interface TrafficControl {
  id: string
  code: string
  title: string
  type: TrafficControlType
  areaName: string
  startAt: string
  endAt: string
  detourInstructions: string
  geometry: MapGeometry | null
  areaSquareMeters: number | null
  publishStatus: TrafficControlPublishStatus
  publisherId: string | null
  publishAt: string | null
  pinned: boolean
  sortOrder: number
  remark: string
  dataSource: TrafficControlDataSource
  syncStatus: string | null
  lastSyncAt: string | null
  externalId: string | null
  overlaps: TrafficControlOverlap[]
  coordinateSystem: 'GCJ-02'
  createdAt: string
  updatedAt: string
}

export type TrafficControlWriteInput = Pick<TrafficControl,
  'title' | 'type' | 'areaName' | 'startAt' | 'endAt' | 'detourInstructions' | 'geometry' | 'pinned' | 'sortOrder'
>

export interface TrafficControlQuery {
  keyword: string
  type: TrafficControlType | 'all'
  publishStatus: TrafficControlPublishStatus | 'all'
  timeStatus: TrafficControlTimeStatus | 'all'
  dateStart: string
  dateEnd: string
}

export type TrafficControlServerQuery = Pick<TrafficControlQuery, 'keyword' | 'type' | 'publishStatus'>

export interface TrafficControlPage {
  records: TrafficControl[]
  total: number
  page: number
  pageSize: number
}

export interface TrafficControlExportFile {
  content: Blob
  filename: string
}

export type TrafficControlField = keyof TrafficControlWriteInput | 'dateRange'

export interface TrafficControlValidationIssue {
  field: TrafficControlField
  code: 'required' | 'invalid' | 'length' | 'range'
  message: string
}

export interface TrafficControlValidationResult {
  valid: boolean
  issues: TrafficControlValidationIssue[]
}

export interface TrafficControlService {
  list(query?: TrafficControlServerQuery): Promise<TrafficControl[]>
  listPage(page: number, pageSize: number, query: TrafficControlServerQuery): Promise<TrafficControlPage>
  get(id: string): Promise<TrafficControl>
  create(input: TrafficControlWriteInput): Promise<TrafficControl>
  update(id: string, input: TrafficControlWriteInput): Promise<TrafficControl>
  remove(id: string): Promise<void>
  publish(id: string): Promise<TrafficControl>
  revoke(id: string): Promise<TrafficControl>
  export(): Promise<TrafficControlExportFile>
}

export const TRAFFIC_CONTROL_TYPES: readonly {
  value: TrafficControlType
  label: string
  color: string
}[] = [
  { value: 'road-closure', label: '封路', color: '#ef4444' },
  { value: 'restriction', label: '限行', color: '#3b82f6' },
  { value: 'detour', label: '绕行', color: '#f59e0b' },
  { value: 'temporary', label: '临时管制', color: '#06b6d4' },
  { value: 'other', label: '其他', color: '#64748b' },
]

export const TRAFFIC_TIME_STATUS_LABELS: Record<TrafficControlTimeStatus, string> = {
  upcoming: '即将开始',
  active: '进行中',
  ended: '已结束',
}

export const TRAFFIC_PUBLISH_STATUS_LABELS: Record<TrafficControlPublishStatus, string> = {
  draft: '草稿',
  published: '已发布',
  revoked: '已撤销',
}

export function trafficControlTypeMeta(type: TrafficControlType) {
  return TRAFFIC_CONTROL_TYPES.find((item) => item.value === type) ?? TRAFFIC_CONTROL_TYPES[4]!
}
