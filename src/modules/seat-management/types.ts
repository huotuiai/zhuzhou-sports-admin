import type { TicketGate } from '@/modules/ticket-gate-management/types'

export type SeatZoneStatus = 'enabled' | 'disabled'
export type SeatZoneStatusFilter = 'all' | SeatZoneStatus

export interface SeatFloor {
  id: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface SeatZone {
  id: string
  code: string
  name: string
  floorId: string
  rowStart: number
  rowEnd: number
  sortOrder: number
  status: SeatZoneStatus
  remark: string
  createdAt: string
  updatedAt: string
}

export interface SeatZoneGateBinding {
  id: string
  zoneCode: string
  gateId: string
}

export interface SeatFloorWriteInput {
  name: string
}

export interface SeatZoneWriteInput {
  code: string
  name: string
  floorId: string
  rowStart: number
  rowEnd: number
  gateIds: string[]
  sortOrder: number
  status: SeatZoneStatus
  remark: string
}

export interface SeatPlanningSnapshot {
  floors: SeatFloor[]
  zones: SeatZone[]
  bindings: SeatZoneGateBinding[]
  ticketGates: TicketGate[]
}

export type SeatPlanningAuditAction =
  | 'create-floor'
  | 'delete-floor'
  | 'create-zone'
  | 'update-zone'
  | 'status-update'
  | 'delete-zone'
  | 'bind-gate'
  | 'unbind-gate'

export interface SeatPlanningAuditLog {
  id: string
  action: SeatPlanningAuditAction
  entityId: string
  entityCode: string
  targetId: string | null
  createdAt: string
}

export interface SeatPlanningService {
  load(): Promise<SeatPlanningSnapshot>
  listAuditLogs(): Promise<SeatPlanningAuditLog[]>
  createFloor(input: SeatFloorWriteInput): Promise<SeatFloor>
  removeFloor(id: string): Promise<void>
  createZone(input: SeatZoneWriteInput): Promise<SeatPlanningSnapshot>
  updateZone(id: string, input: SeatZoneWriteInput): Promise<SeatPlanningSnapshot>
  updateZoneStatus(id: string, status: SeatZoneStatus): Promise<SeatZone>
  removeZone(id: string): Promise<SeatPlanningSnapshot>
}

export interface SeatPlanningQuery {
  keyword: string
  floorId: 'all' | string
  status: SeatZoneStatusFilter
  gateIds: string[]
}

export type SeatFloorValidationField = keyof SeatFloorWriteInput
export type SeatZoneValidationField = keyof SeatZoneWriteInput

export interface SeatFloorValidationIssue {
  field: SeatFloorValidationField
  code: 'required' | 'duplicate' | 'too_long'
  message: string
}

export interface SeatZoneValidationIssue {
  field: SeatZoneValidationField
  code: 'required' | 'duplicate' | 'invalid' | 'not_found' | 'too_long' | 'positive_integer'
  message: string
}

export interface SeatFloorValidationResult {
  valid: boolean
  issues: readonly SeatFloorValidationIssue[]
}

export interface SeatZoneValidationResult {
  valid: boolean
  issues: readonly SeatZoneValidationIssue[]
}

export interface SeatFloorTreeRow {
  key: string
  kind: 'floor'
  floor: SeatFloor
  matchingZoneCount: number
}

export interface SeatZoneTreeRow {
  key: string
  kind: 'zone'
  zone: SeatZone
}

export type SeatPlanningTreeRow = SeatFloorTreeRow | SeatZoneTreeRow
