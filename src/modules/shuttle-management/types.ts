import type { GeoPoint } from '@/components/map/types'

export type ShuttleDirection = 'inbound' | 'outbound'
export type ShuttleOperatingStatus = 'operating' | 'suspended' | 'partial'

export interface ShuttleStation {
  id: string
  name: string
  point: GeoPoint | null
  navigationAddress: string
  arrivalOffsetMinutes: number | null
  arrivalGateIds: string[]
}

export interface ShuttleRoute {
  id: string
  code: string
  name: string
  direction: ShuttleDirection
  description: string
  firstDeparture: string
  lastDeparture: string
  departureIntervalMinutes: number
  durationMinutes: number
  operatingStatus: ShuttleOperatingStatus
  realtimeStatusText: string
  sortOrder: number
  enabled: boolean
  stations: ShuttleStation[]
  coordinateSystem: 'GCJ-02'
  createdAt: string
  updatedAt: string
}

export interface ShuttleRouteBaseInput {
  name: string
  direction: ShuttleDirection
  description: string
  firstDeparture: string
  lastDeparture: string
  departureIntervalMinutes: number
  durationMinutes: number
  operatingStatus: ShuttleOperatingStatus
  realtimeStatusText: string
  sortOrder: number
  enabled: boolean
}

export interface ShuttleRouteCreateInput extends ShuttleRouteBaseInput {
  code: string
}

export type ShuttleRouteUpdateInput = ShuttleRouteBaseInput

export interface ShuttleRouteService {
  list(): Promise<ShuttleRoute[]>
  create(input: ShuttleRouteCreateInput): Promise<ShuttleRoute>
  update(id: string, input: ShuttleRouteUpdateInput): Promise<ShuttleRoute>
  replaceStations(id: string, stations: readonly ShuttleStation[]): Promise<ShuttleRoute>
  remove(id: string): Promise<void>
}

export interface ShuttleRouteQuery {
  keyword: string
  direction: ShuttleDirection | 'all'
  operatingStatus: ShuttleOperatingStatus | 'all'
}

export type ShuttleRouteValidationField = keyof ShuttleRouteBaseInput | 'code' | 'schedule'

export interface ShuttleRouteValidationIssue {
  field: ShuttleRouteValidationField
  code: 'required' | 'duplicate' | 'invalid' | 'range'
  message: string
}

export type ShuttleStationValidationField = 'stations' | 'name' | 'point' | 'arrivalOffsetMinutes'

export interface ShuttleStationValidationIssue {
  field: ShuttleStationValidationField
  stationId?: string
  code: 'required' | 'invalid' | 'limit'
  message: string
}

export interface ValidationResult<TIssue> {
  valid: boolean
  issues: readonly TIssue[]
}

export const SHUTTLE_DIRECTIONS: readonly { value: ShuttleDirection, label: string }[] = [
  { value: 'inbound', label: '进场' },
  { value: 'outbound', label: '出场' },
]

export const SHUTTLE_OPERATING_STATUSES: readonly { value: ShuttleOperatingStatus, label: string }[] = [
  { value: 'operating', label: '运营中' },
  { value: 'suspended', label: '停运' },
  { value: 'partial', label: '部分运营' },
]

export function shuttleDirectionLabel(value: ShuttleDirection): string {
  return SHUTTLE_DIRECTIONS.find((item) => item.value === value)?.label ?? '未知方向'
}

export function shuttleOperatingStatusLabel(value: ShuttleOperatingStatus): string {
  return SHUTTLE_OPERATING_STATUSES.find((item) => item.value === value)?.label ?? '未知状态'
}
