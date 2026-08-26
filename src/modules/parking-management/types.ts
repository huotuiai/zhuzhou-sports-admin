import type { GeoPoint } from '@/components/map/types'

export type ParkingFeeType = 'free' | 'paid'
export type ParkingOpenStatus = 'open' | 'closed'
export type ParkingAvailabilityUpdateMethod = 'integrated' | 'manual'
export type ParkingAvailabilityLevel = 'ample' | 'tight' | 'nearly-full'

export interface ParkingLot {
  id: string
  code: string
  name: string
  locationDescription: string
  point: GeoPoint | null
  navigationAddress: string
  totalSpaces: number
  availableSpaces: number
  availabilityUpdateMethod: ParkingAvailabilityUpdateMethod
  feeType: ParkingFeeType
  feeStandard: string
  openStatus: ParkingOpenStatus
  enabled: boolean
  recommendationWeight: number
  sortOrder: number
  remark: string
  coordinateSystem: 'GCJ-02'
  availabilityUpdatedAt: string
  createdAt: string
  updatedAt: string
}

export interface ParkingLotBaseInput {
  name: string
  locationDescription: string
  point: GeoPoint | null
  navigationAddress: string
  totalSpaces: number
  availabilityUpdateMethod: ParkingAvailabilityUpdateMethod
  feeType: ParkingFeeType
  feeStandard: string
  openStatus: ParkingOpenStatus
  enabled: boolean
  recommendationWeight: number
  sortOrder: number
  remark: string
}

export interface ParkingLotCreateInput extends ParkingLotBaseInput {
  code: string
}

export type ParkingLotUpdateInput = ParkingLotBaseInput

export interface ParkingLotGateBindingValue {
  gateId: string
  walkingMinutes: number | null
}

export interface ParkingLotFormValue extends Omit<ParkingLotCreateInput, 'point'> {
  coordinateInput: string
  nearbyGateBindings: ParkingLotGateBindingValue[]
}

export interface ParkingLotUpdateOptions {
  clampAvailableSpaces?: boolean
}

export interface ParkingLotService {
  list(): Promise<ParkingLot[]>
  create(input: ParkingLotCreateInput): Promise<ParkingLot>
  update(id: string, input: ParkingLotUpdateInput, options?: ParkingLotUpdateOptions): Promise<ParkingLot>
  updateAvailability(id: string, availableSpaces: number): Promise<ParkingLot>
  remove(id: string): Promise<void>
}

export interface ParkingLotQuery {
  keyword: string
  feeType: ParkingFeeType | 'all'
  openStatus: ParkingOpenStatus | 'all'
  availabilityUpdateMethod: ParkingAvailabilityUpdateMethod | 'all'
}

export type ParkingLotValidationField = keyof ParkingLotCreateInput

export interface ParkingLotValidationIssue {
  field: ParkingLotValidationField
  code: 'required' | 'duplicate' | 'invalid' | 'range' | 'too_long'
  message: string
}

export interface ParkingLotValidationResult {
  valid: boolean
  issues: readonly ParkingLotValidationIssue[]
}

export const PARKING_FEE_TYPES: readonly { value: ParkingFeeType, label: string }[] = [
  { value: 'free', label: '免费' },
  { value: 'paid', label: '收费' },
]

export const PARKING_OPEN_STATUSES: readonly { value: ParkingOpenStatus, label: string }[] = [
  { value: 'open', label: '开放' },
  { value: 'closed', label: '关闭' },
]

export const PARKING_AVAILABILITY_UPDATE_METHODS: readonly { value: ParkingAvailabilityUpdateMethod, label: string }[] = [
  { value: 'integrated', label: '系统对接' },
  { value: 'manual', label: '手动' },
]

export function parkingFeeTypeLabel(value: ParkingFeeType): string {
  return PARKING_FEE_TYPES.find((item) => item.value === value)?.label ?? '未知收费类型'
}

export function parkingOpenStatusLabel(value: ParkingOpenStatus): string {
  return PARKING_OPEN_STATUSES.find((item) => item.value === value)?.label ?? '未知开放状态'
}

export function parkingAvailabilityUpdateMethodLabel(value: ParkingAvailabilityUpdateMethod): string {
  return PARKING_AVAILABILITY_UPDATE_METHODS.find((item) => item.value === value)?.label ?? '未知更新方式'
}
