import type {
  GateParkingRelation,
  GateParkingRelationInput,
  GateShuttleRelation,
  GateShuttleRelationInput,
  GeoPoint,
  SeatZoneGateBinding,
  TicketGateRelationService,
  TicketGateRelationSnapshot,
} from '../types'
import { createClientId } from '@/lib/id'

export const TICKET_GATE_RELATION_STORAGE_KEY = 'zz-sports-ticket-gate-relations:v1'
export const SEAT_ZONE_GATE_BINDING_STORAGE_KEY = 'zz-sports-seat-zone-gate-bindings:v1'
const SCHEMA_VERSION = 1

type RelationAuditAction = 'bind-parking' | 'unbind-parking' | 'bind-shuttle' | 'unbind-shuttle'

interface RelationAuditLog {
  id: string
  gateId: string
  action: RelationAuditAction
  targetId: string
  createdAt: string
}

interface StoredRelations {
  schemaVersion: typeof SCHEMA_VERSION
  parkingRelations: GateParkingRelation[]
  shuttleRelations: GateShuttleRelation[]
  auditLogs: RelationAuditLog[]
}

export interface LocalTicketGateRelationServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

export class TicketGateRelationServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TicketGateRelationServiceError'
  }
}

function resolveStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') throw new TicketGateRelationServiceError('当前环境不支持本地存储')
  return globalThis.localStorage
}

function cloneParking(item: GateParkingRelation): GateParkingRelation {
  return { ...item }
}

function cloneShuttle(item: GateShuttleRelation): GateShuttleRelation {
  return { ...item }
}

function cloneSnapshot(envelope: StoredRelations, gateId: string): TicketGateRelationSnapshot {
  return {
    parkingRelations: envelope.parkingRelations.filter((item) => item.gateId === gateId).map(cloneParking),
    shuttleRelations: envelope.shuttleRelations.filter((item) => item.gateId === gateId).map(cloneShuttle),
  }
}

function isWalkingMinutes(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0)
}

function isParkingRelation(value: unknown): value is GateParkingRelation {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.gateId === 'string' && typeof item.parkingLotId === 'string' &&
    isWalkingMinutes(item.walkingMinutes) && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isShuttleRelation(value: unknown): value is GateShuttleRelation {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.gateId === 'string' && typeof item.shuttlePointId === 'string' &&
    typeof item.stationId === 'string' && ['entry', 'exit', 'bidirectional'].includes(String(item.direction)) &&
    isWalkingMinutes(item.walkingMinutes) && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isAuditLog(value: unknown): value is RelationAuditLog {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.gateId === 'string' && typeof item.targetId === 'string' &&
    ['bind-parking', 'unbind-parking', 'bind-shuttle', 'unbind-shuttle'].includes(String(item.action)) &&
    typeof item.createdAt === 'string'
}

function isSeatZoneBinding(value: unknown): value is SeatZoneGateBinding {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.zoneCode === 'string' && typeof item.gateId === 'string'
}

function validateWalkingMinutes(value: number | null): void {
  if (!isWalkingMinutes(value)) throw new TicketGateRelationServiceError('步行时间必须是大于 0 的整数或留空')
}

function toRadians(value: number): number {
  return value * Math.PI / 180
}

export function estimateWalkingMinutes(from: GeoPoint | null, to: GeoPoint | null): number | null {
  if (!from || !to) return null
  const earthRadius = 6_371_000
  const latDelta = toRadians(to.lat - from.lat)
  const lngDelta = toRadians(to.lng - from.lng)
  const firstLat = toRadians(from.lat)
  const secondLat = toRadians(to.lat)
  const haversine = Math.sin(latDelta / 2) ** 2 + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lngDelta / 2) ** 2
  const meters = earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  return Math.max(1, Math.ceil(meters / 80))
}

export class LocalTicketGateRelationService implements TicketGateRelationService {
  private readonly injectedStorage?: Storage
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalTicketGateRelationServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveStorage()
  }

  private read(): StoredRelations {
    const raw = this.storage.getItem(TICKET_GATE_RELATION_STORAGE_KEY)
    if (!raw) return { schemaVersion: SCHEMA_VERSION, parkingRelations: [], shuttleRelations: [], auditLogs: [] }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredRelations>
      if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.parkingRelations) || !parsed.parkingRelations.every(isParkingRelation) ||
        !Array.isArray(parsed.shuttleRelations) || !parsed.shuttleRelations.every(isShuttleRelation) ||
        !Array.isArray(parsed.auditLogs) || !parsed.auditLogs.every(isAuditLog)) throw new Error('Invalid relation data')
      return {
        schemaVersion: SCHEMA_VERSION,
        parkingRelations: parsed.parkingRelations.map(cloneParking),
        shuttleRelations: parsed.shuttleRelations.map(cloneShuttle),
        auditLogs: parsed.auditLogs.map((item) => ({ ...item })),
      }
    } catch (error) {
      throw new TicketGateRelationServiceError('本地检票口关联数据无法解析', { cause: error })
    }
  }

  private write(envelope: StoredRelations): void {
    this.storage.setItem(TICKET_GATE_RELATION_STORAGE_KEY, JSON.stringify(envelope))
  }

  private audit(envelope: StoredRelations, gateId: string, action: RelationAuditAction, targetId: string): void {
    envelope.auditLogs.push({ id: this.createId(), gateId, action, targetId, createdAt: this.now().toISOString() })
    if (envelope.auditLogs.length > 500) envelope.auditLogs.splice(0, envelope.auditLogs.length - 500)
  }

  async listSeatZoneBindings(): Promise<SeatZoneGateBinding[]> {
    const raw = this.storage.getItem(SEAT_ZONE_GATE_BINDING_STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as { schemaVersion?: unknown, records?: unknown }
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records) || !parsed.records.every(isSeatZoneBinding)) {
        throw new Error('Invalid seat zone bindings')
      }
      return parsed.records.map((item) => ({ ...item }))
    } catch (error) {
      throw new TicketGateRelationServiceError('座位分区绑定数据无法解析', { cause: error })
    }
  }

  async countSeatZoneBindings(gateId: string): Promise<number> {
    return (await this.listSeatZoneBindings()).filter((item) => item.gateId === gateId).length
  }

  async listRelations(gateId: string): Promise<TicketGateRelationSnapshot> {
    return cloneSnapshot(this.read(), gateId)
  }

  async bindParking(input: GateParkingRelationInput): Promise<GateParkingRelation> {
    validateWalkingMinutes(input.walkingMinutes)
    const envelope = this.read()
    if (envelope.parkingRelations.some((item) => item.gateId === input.gateId && item.parkingLotId === input.parkingLotId)) {
      throw new TicketGateRelationServiceError('该停车场已绑定到当前检票口')
    }
    const timestamp = this.now().toISOString()
    const relation: GateParkingRelation = { ...input, id: this.createId(), createdAt: timestamp, updatedAt: timestamp }
    envelope.parkingRelations.push(relation)
    this.audit(envelope, input.gateId, 'bind-parking', input.parkingLotId)
    this.write(envelope)
    return cloneParking(relation)
  }

  async unbindParking(id: string): Promise<void> {
    const envelope = this.read()
    const relation = envelope.parkingRelations.find((item) => item.id === id)
    if (!relation) throw new TicketGateRelationServiceError('未找到要移除的停车场关系')
    envelope.parkingRelations = envelope.parkingRelations.filter((item) => item.id !== id)
    this.audit(envelope, relation.gateId, 'unbind-parking', relation.parkingLotId)
    this.write(envelope)
  }

  async bindShuttle(input: GateShuttleRelationInput): Promise<GateShuttleRelation> {
    validateWalkingMinutes(input.walkingMinutes)
    const envelope = this.read()
    if (envelope.shuttleRelations.some((item) => item.gateId === input.gateId && item.shuttlePointId === input.shuttlePointId &&
      item.stationId === input.stationId && item.direction === input.direction)) {
      throw new TicketGateRelationServiceError('该接驳站及方向已绑定到当前检票口')
    }
    const timestamp = this.now().toISOString()
    const relation: GateShuttleRelation = { ...input, id: this.createId(), createdAt: timestamp, updatedAt: timestamp }
    envelope.shuttleRelations.push(relation)
    this.audit(envelope, input.gateId, 'bind-shuttle', `${input.shuttlePointId}:${input.stationId}`)
    this.write(envelope)
    return cloneShuttle(relation)
  }

  async unbindShuttle(id: string): Promise<void> {
    const envelope = this.read()
    const relation = envelope.shuttleRelations.find((item) => item.id === id)
    if (!relation) throw new TicketGateRelationServiceError('未找到要移除的接驳站关系')
    envelope.shuttleRelations = envelope.shuttleRelations.filter((item) => item.id !== id)
    this.audit(envelope, relation.gateId, 'unbind-shuttle', `${relation.shuttlePointId}:${relation.stationId}`)
    this.write(envelope)
  }

  async cleanupGate(gateId: string): Promise<void> {
    const envelope = this.read()
    envelope.parkingRelations = envelope.parkingRelations.filter((item) => item.gateId !== gateId)
    envelope.shuttleRelations = envelope.shuttleRelations.filter((item) => item.gateId !== gateId)
    this.write(envelope)
  }

  async reconcile(parkingLotIds: readonly string[], shuttleStationKeys: readonly string[]): Promise<void> {
    const envelope = this.read()
    const parkingSet = new Set(parkingLotIds)
    const shuttleSet = new Set(shuttleStationKeys)
    const nextParking = envelope.parkingRelations.filter((item) => parkingSet.has(item.parkingLotId))
    const nextShuttle = envelope.shuttleRelations.filter((item) => shuttleSet.has(`${item.shuttlePointId}:${item.stationId}`))
    if (nextParking.length === envelope.parkingRelations.length && nextShuttle.length === envelope.shuttleRelations.length) return
    envelope.parkingRelations = nextParking
    envelope.shuttleRelations = nextShuttle
    this.write(envelope)
  }
}

export const ticketGateRelationService: TicketGateRelationService = new LocalTicketGateRelationService()
