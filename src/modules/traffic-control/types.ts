import type { MapGeometry } from '@/components/map/types'

export type TrafficControlType = 'road-closure' | 'restriction' | 'detour' | 'temporary' | 'other'
export type TrafficControlTimeStatus = 'upcoming' | 'active' | 'ended'

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
  pinned: boolean
  sortOrder: number
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
  timeStatus: TrafficControlTimeStatus | 'all'
  dateStart: string
  dateEnd: string
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
  list(): Promise<TrafficControl[]>
  create(input: TrafficControlWriteInput): Promise<TrafficControl>
  update(id: string, input: TrafficControlWriteInput): Promise<TrafficControl>
  remove(id: string): Promise<void>
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

export function trafficControlTypeMeta(type: TrafficControlType) {
  return TRAFFIC_CONTROL_TYPES.find((item) => item.value === type) ?? TRAFFIC_CONTROL_TYPES[4]!
}
