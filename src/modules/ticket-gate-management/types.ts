export type TicketGateDirection = 'entry' | 'exit' | 'bidirectional'

export interface TicketGate {
  id: string
  name: string
  code: string
  venueArea: string
  location: string
  direction: TicketGateDirection
  laneCount: number
  deviceCount: number
  enabled: boolean
  remark: string
  createdAt: string
  updatedAt: string
}

export interface TicketGateWriteInput {
  name: string
  code: string
  venueArea: string
  location: string
  direction: TicketGateDirection
  laneCount: number
  deviceCount: number
  enabled: boolean
  remark: string
}

export interface TicketGateService {
  list(): Promise<TicketGate[]>
  create(input: TicketGateWriteInput): Promise<TicketGate>
  update(id: string, input: TicketGateWriteInput): Promise<TicketGate>
  remove(id: string): Promise<void>
}

export type TicketGateStatusFilter = 'all' | 'enabled' | 'disabled'
export type TicketGateDirectionFilter = 'all' | TicketGateDirection

export interface TicketGateQuery {
  keyword: string
  direction: TicketGateDirectionFilter
  status: TicketGateStatusFilter
}

export type TicketGateValidationField =
  | 'name'
  | 'code'
  | 'venueArea'
  | 'laneCount'
  | 'deviceCount'
  | 'remark'

export interface TicketGateValidationIssue {
  field: TicketGateValidationField
  code: 'required' | 'duplicate' | 'positive_integer' | 'non_negative_integer' | 'too_long'
  message: string
}

export interface TicketGateValidationResult {
  valid: boolean
  issues: readonly TicketGateValidationIssue[]
}
