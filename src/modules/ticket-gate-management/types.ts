export type TicketGateFloor = '一层' | '二层'
export type TicketGateStatus = 'open' | 'closed' | 'restricted'
export type TicketGateStatusFilter = 'all' | TicketGateStatus
export type TicketGateFloorFilter = 'all' | TicketGateFloor
export type GateRelationDirection = 'entry' | 'exit' | 'bidirectional'

export interface GeoPoint {
  lng: number
  lat: number
}

export interface TicketGate {
  id: string
  code: string
  name: string
  floor: TicketGateFloor
  locationDescription: string
  mapPoints: GeoPoint[]
  navigationAddress: string
  navigationPoint: GeoPoint | null
  sortOrder: number
  status: TicketGateStatus
  statusRemark: string
  createdAt: string
  updatedAt: string
}

/** 表单/写接口使用 JSON 字符串承接原型中的地图坐标输入。 */
export interface TicketGateWriteInput {
  code: string
  name: string
  floor: TicketGateFloor
  locationDescription: string
  mapCoordinates: string
  navigationAddress: string
  navigationLongitude: number | null
  navigationLatitude: number | null
  sortOrder: number
  status: TicketGateStatus
  statusRemark: string
}

export interface TicketGateStatusInput {
  status: TicketGateStatus
  statusRemark: string
}

export interface TicketGateService {
  list(): Promise<TicketGate[]>
  create(input: TicketGateWriteInput): Promise<TicketGate>
  update(id: string, input: TicketGateWriteInput): Promise<TicketGate>
  updateStatus(id: string, input: TicketGateStatusInput): Promise<TicketGate>
  remove(id: string): Promise<void>
  listAuditLogs(): Promise<TicketGateAuditLog[]>
}

export interface TicketGateQuery {
  keyword: string
  status: TicketGateStatusFilter
  floor: TicketGateFloorFilter
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

export type TicketGateAuditAction = 'create' | 'update' | 'status-update' | 'delete'

export interface TicketGateAuditLog {
  id: string
  gateId: string
  gateCode: string
  action: TicketGateAuditAction
  createdAt: string
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
  bindParking(input: GateParkingRelationInput): Promise<GateParkingRelation>
  unbindParking(id: string): Promise<void>
  bindShuttle(input: GateShuttleRelationInput): Promise<GateShuttleRelation>
  unbindShuttle(id: string): Promise<void>
  cleanupGate(gateId: string): Promise<void>
  cleanupParkingLot(parkingLotId: string): Promise<void>
  reconcile(parkingLotIds: readonly string[], shuttleStationKeys: readonly string[]): Promise<void>
}
