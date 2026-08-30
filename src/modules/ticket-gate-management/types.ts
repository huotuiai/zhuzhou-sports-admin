import type { BackendCsvExportFile } from '@/lib/http'

export type TicketGateStatus = 'open' | 'closed' | 'restricted'
export type TicketGateStatusFilter = 'all' | TicketGateStatus
export type GateRelationDirection = 'entry' | 'exit' | 'bidirectional'

export interface GeoPoint {
  lng: number
  lat: number
}

export interface TicketGate {
  id: string
  code: string
  name: string
  floorId: string
  floorName: string
  locationDescription: string
  point: GeoPoint
  navigationAddress: string
  sortOrder: number
  status: TicketGateStatus
  statusRemark: string
  enabled: boolean
  zoneIds: string[]
  zoneNames: string[]
  matchOpen: boolean
  createdAt: string
  updatedAt: string
}

export interface TicketGateFloorOption {
  id: string
  name: string
  enabled: boolean
  sortOrder: number
}

/** 表单使用“经度, 纬度”字符串承接接口要求的单个定位点。 */
export interface TicketGateWriteInput {
  code: string
  name: string
  floorId: string
  locationDescription: string
  mapCoordinates: string
  navigationAddress: string
  sortOrder: number
  status: TicketGateStatus
  statusRemark: string
}

export interface TicketGateStatusInput {
  status: TicketGateStatus
  statusRemark: string
}

export interface TicketGateService {
  list(query?: TicketGateQuery): Promise<TicketGate[]>
  listPage(page: number, pageSize: number, query: TicketGateQuery): Promise<TicketGatePage>
  exportCsv(query: TicketGateQuery): Promise<BackendCsvExportFile>
  listFloors(): Promise<TicketGateFloorOption[]>
  get(id: string): Promise<TicketGate>
  create(input: TicketGateWriteInput): Promise<TicketGate>
  update(id: string, input: TicketGateWriteInput): Promise<TicketGate>
  updateStatus(id: string, input: TicketGateStatusInput): Promise<TicketGate>
  remove(id: string): Promise<void>
}

export interface TicketGateQuery {
  keyword: string
  status: TicketGateStatusFilter
  floorId: 'all' | string
}

export interface TicketGatePage {
  records: TicketGate[]
  total: number
  page: number
  pageSize: number
}

export type TicketGateValidationField = keyof TicketGateWriteInput

export interface TicketGateValidationIssue {
  field: TicketGateValidationField
  code: 'required' | 'duplicate' | 'invalid' | 'positive_integer'
  message: string
}

export interface TicketGateValidationResult {
  valid: boolean
  issues: readonly TicketGateValidationIssue[]
}

export interface SeatZoneGateBinding {
  id: string
  zoneCode: string
  gateId: string
}

export interface GateParkingRelation {
  id: string
  gateId: string
  parkingLotId: string
  walkingMinutes: number | null
  createdAt: string
  updatedAt: string
}

export interface GateShuttleRelation {
  id: string
  gateId: string
  shuttlePointId: string
  stationId: string
  direction: GateRelationDirection
  walkingMinutes: number | null
  createdAt: string
  updatedAt: string
}

export interface GateParkingRelationInput {
  gateId: string
  parkingLotId: string
  walkingMinutes: number | null
}

export interface ParkingLotGateBindingInput {
  gateId: string
  walkingMinutes: number
}

export interface GateShuttleRelationInput {
  gateId: string
  shuttlePointId: string
  stationId: string
  direction: GateRelationDirection
  walkingMinutes: number | null
}

export interface TicketGateRelationSnapshot {
  parkingRelations: GateParkingRelation[]
  shuttleRelations: GateShuttleRelation[]
}

export interface TicketGateRelationService {
  listSeatZoneBindings(): Promise<SeatZoneGateBinding[]>
  countSeatZoneBindings(gateId: string): Promise<number>
  listRelations(gateId: string): Promise<TicketGateRelationSnapshot>
  listParkingLotRelations(parkingLotId: string): Promise<GateParkingRelation[]>
  listShuttleRouteRelations(shuttlePointId: string): Promise<GateShuttleRelation[]>
  replaceParkingLotRelations(parkingLotId: string, bindings: readonly ParkingLotGateBindingInput[]): Promise<GateParkingRelation[]>
  bindParking(input: GateParkingRelationInput): Promise<GateParkingRelation>
  unbindParking(id: string): Promise<void>
  bindShuttle(input: GateShuttleRelationInput): Promise<GateShuttleRelation>
  unbindShuttle(id: string): Promise<void>
  cleanupGate(gateId: string): Promise<void>
  cleanupParkingLot(parkingLotId: string): Promise<void>
  cleanupShuttleRoute(shuttlePointId: string): Promise<void>
  reconcile(parkingLotIds: readonly string[], shuttleStationKeys: readonly string[]): Promise<void>
}
