export type SeatType = 'standard' | 'vip' | 'accessible'
export type SeatStatus = 'available' | 'disabled' | 'maintenance'

export interface VenueSeat {
  id: string
  code: string
  venueArea: string
  section: string
  rowNumber: string
  seatNumber: string
  type: SeatType
  status: SeatStatus
  remark: string
  createdAt: string
  updatedAt: string
}

export interface VenueSeatWriteInput {
  code: string
  venueArea: string
  section: string
  rowNumber: string
  seatNumber: string
  type: SeatType
  status: SeatStatus
  remark: string
}

export interface VenueSeatService {
  list(): Promise<VenueSeat[]>
  create(input: VenueSeatWriteInput): Promise<VenueSeat>
  update(id: string, input: VenueSeatWriteInput): Promise<VenueSeat>
  remove(id: string): Promise<void>
}

export type SeatTypeFilter = 'all' | SeatType
export type SeatStatusFilter = 'all' | SeatStatus

export interface VenueSeatQuery {
  keyword: string
  type: SeatTypeFilter
  status: SeatStatusFilter
}

export type VenueSeatValidationField =
  | 'code'
  | 'venueArea'
  | 'section'
  | 'rowNumber'
  | 'seatNumber'
  | 'remark'

export interface VenueSeatValidationIssue {
  field: VenueSeatValidationField
  code: 'required' | 'duplicate' | 'too_long'
  message: string
}

export interface VenueSeatValidationResult {
  valid: boolean
  issues: readonly VenueSeatValidationIssue[]
}
