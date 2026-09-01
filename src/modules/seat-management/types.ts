import type { BackendCsvExportFile } from '@/lib/http'

export type SeatZoneStatus = 'enabled' | 'disabled'
export type SeatZoneStatusFilter = 'all' | SeatZoneStatus
export type SeatGateOpenStatus = 'open' | 'closed' | 'restricted'

export interface SeatFloor {
  id: string
  name: string
  sortOrder: number
  status: SeatZoneStatus
  zoneCount: number
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
  gateIds: string[]
  gateNames: string[]
  openGateIds: string[]
  openGateNames: string[]
  createdAt: string
  updatedAt: string
}

export interface SeatGateOption {
  id: string
  code: string
  name: string
  openStatus: SeatGateOpenStatus
  enabled: boolean
  matchOpen: boolean
}

export interface SeatFloorWriteInput {
  name: string
}

export interface SeatFloorCreateInput extends SeatFloorWriteInput {
  sortOrder: number
  status: SeatZoneStatus
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

export interface SeatZonePage {
  zones: SeatZone[]
  total: number
  page: number
  pageSize: number
}

export interface SeatZoneImportResult {
  imported: number
}

export interface SeatPlanningService {
  listFloors(): Promise<SeatFloor[]>
  createFloor(input: SeatFloorCreateInput): Promise<SeatFloor>
  deleteFloor(id: string): Promise<void>
  listZones(page: number, pageSize: number): Promise<SeatZonePage>
  getZone(id: string): Promise<SeatZone>
  createZone(input: SeatZoneWriteInput): Promise<SeatZone>
  updateZone(id: string, input: SeatZoneWriteInput): Promise<SeatZone>
  deleteZone(id: string): Promise<void>
  exportCsv(): Promise<BackendCsvExportFile>
  importCsv(csv: string): Promise<SeatZoneImportResult>
  listGateOptions(): Promise<SeatGateOption[]>
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
