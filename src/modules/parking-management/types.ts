import type { GeoPoint } from '@/components/map/types'

export type ParkingFeeType = 'free' | 'paid'
export type ParkingOpenStatus = 'open' | 'closed'
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

export interface ParkingLotFormValue extends Omit<ParkingLotCreateInput, 'point'> {
  coordinateInput: string
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
  enabled: 'all' | 'enabled' | 'disabled'
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

export function parkingFeeTypeLabel(value: ParkingFeeType): string {
  return PARKING_FEE_TYPES.find((item) => item.value === value)?.label ?? '未知收费类型'
}

export function parkingOpenStatusLabel(value: ParkingOpenStatus): string {
  return PARKING_OPEN_STATUSES.find((item) => item.value === value)?.label ?? '未知开放状态'
}
