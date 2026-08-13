export interface ParkingLot {
  id: string
  name: string
  code: string
  address: string
  totalSpaces: number
  enabled: boolean
  remark: string
  createdAt: string
  updatedAt: string
}

export interface ParkingLotWriteInput {
  name: string
  code: string
  address: string
  totalSpaces: number
  enabled: boolean
  remark: string
}

export interface ParkingLotService {
  list(): Promise<ParkingLot[]>
  create(input: ParkingLotWriteInput): Promise<ParkingLot>
  update(id: string, input: ParkingLotWriteInput): Promise<ParkingLot>
  remove(id: string): Promise<void>
}

export type ParkingLotStatusFilter = 'all' | 'enabled' | 'disabled'

export interface ParkingLotQuery {
  name: string
  code: string
  status: ParkingLotStatusFilter
}

export type ParkingLotValidationField = 'name' | 'code' | 'totalSpaces' | 'remark'

export interface ParkingLotValidationIssue {
  field: ParkingLotValidationField
  code: 'required' | 'duplicate' | 'non_negative_integer' | 'too_long'
  message: string
}

export interface ParkingLotValidationResult {
  valid: boolean
  issues: readonly ParkingLotValidationIssue[]
}
