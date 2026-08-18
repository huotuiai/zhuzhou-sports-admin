import type { TicketGate, TicketGateService } from '@/modules/ticket-gate-management/types'
import type {
  SeatFloor,
  SeatFloorValidationIssue,
  SeatFloorValidationResult,
  SeatFloorWriteInput,
  SeatPlanningAuditAction,
  SeatPlanningAuditLog,
  SeatPlanningService,
  SeatPlanningSnapshot,
  SeatZone,
  SeatZoneGateBinding,
  SeatZoneStatus,
  SeatZoneValidationIssue,
  SeatZoneValidationResult,
  SeatZoneWriteInput,
} from '../types'
import { createClientId } from '@/lib/id'
import { SEAT_ZONE_GATE_BINDING_STORAGE_KEY } from '@/modules/ticket-gate-management/services/ticket-gate-relation-service'
import { ticketGateService } from '@/modules/ticket-gate-management/services/ticket-gate-service'

export const LEGACY_VENUE_SEAT_STORAGE_KEY = 'zz-sports-venue-seats:v1'
export const SEAT_PLANNING_STORAGE_KEY = 'zz-sports-seat-planning:v1'
const SCHEMA_VERSION = 1
const MAX_AUDIT_LOGS = 500

interface StoredSeatPlanning {
  schemaVersion: typeof SCHEMA_VERSION
  floors: SeatFloor[]
  zones: SeatZone[]
  auditLogs: SeatPlanningAuditLog[]
}

interface StoredSeatZoneBindings {
  schemaVersion: 1
  records: SeatZoneGateBinding[]
}

export interface LocalSeatPlanningServiceOptions {
  storage?: Storage
  gateService?: TicketGateService
  createId?: () => string
  now?: () => Date
}

export class SeatPlanningServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SeatPlanningServiceError'
  }
}

function resolveStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') throw new SeatPlanningServiceError('当前环境不支持本地存储')
  return globalThis.localStorage
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function identity(value: string): string {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

function cloneFloor(item: SeatFloor): SeatFloor {
  return { ...item }
}

function cloneZone(item: SeatZone): SeatZone {
  return { ...item }
}

function cloneBinding(item: SeatZoneGateBinding): SeatZoneGateBinding {
  return { ...item }
}

function cloneAudit(item: SeatPlanningAuditLog): SeatPlanningAuditLog {
  return { ...item }
}

function cloneGate(item: TicketGate): TicketGate {
  return {
    ...item,
    mapPoints: item.mapPoints.map((point) => ({ ...point })),
    navigationPoint: item.navigationPoint ? { ...item.navigationPoint } : null,
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isFloor(value: unknown): value is SeatFloor {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' && isPositiveInteger(item.sortOrder) &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isZone(value: unknown): value is SeatZone {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.code === 'string' && typeof item.name === 'string' &&
    typeof item.floorId === 'string' && isPositiveInteger(item.rowStart) && isPositiveInteger(item.rowEnd) &&
    isPositiveInteger(item.sortOrder) && ['enabled', 'disabled'].includes(String(item.status)) &&
    typeof item.remark === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isBinding(value: unknown): value is SeatZoneGateBinding {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.zoneCode === 'string' && typeof item.gateId === 'string'
}

function isAudit(value: unknown): value is SeatPlanningAuditLog {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const actions: SeatPlanningAuditAction[] = [
    'create-floor', 'delete-floor', 'create-zone', 'update-zone', 'status-update', 'delete-zone', 'bind-gate', 'unbind-gate',
  ]
  return typeof item.id === 'string' && actions.includes(item.action as SeatPlanningAuditAction) &&
    typeof item.entityId === 'string' && typeof item.entityCode === 'string' &&
    (item.targetId === null || typeof item.targetId === 'string') && typeof item.createdAt === 'string'
}

export function sanitizeSeatFloorInput(input: SeatFloorWriteInput): SeatFloorWriteInput {
  return { name: normalizeText(input.name) }
}

export function sanitizeSeatZoneInput(input: SeatZoneWriteInput): SeatZoneWriteInput {
  return {
    code: normalizeText(input.code).toUpperCase(),
    name: normalizeText(input.name),
    floorId: normalizeText(input.floorId),
    rowStart: input.rowStart,
    rowEnd: input.rowEnd,
    gateIds: [...new Set(input.gateIds.map(normalizeText).filter(Boolean))],
    sortOrder: input.sortOrder,
    status: input.status,
    remark: normalizeText(input.remark),
  }
}

export function validateSeatFloorInput(
  input: SeatFloorWriteInput,
  floors: readonly SeatFloor[] = [],
): SeatFloorValidationResult {
  const value = sanitizeSeatFloorInput(input)
  const issues: SeatFloorValidationIssue[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入楼层名称' })
  else if (Array.from(value.name).length > 20) issues.push({ field: 'name', code: 'too_long', message: '楼层名称不能超过 20 个字符' })
  else if (floors.some((item) => identity(item.name) === identity(value.name))) {
    issues.push({ field: 'name', code: 'duplicate', message: '楼层名称不能重复' })
  }
  return { valid: issues.length === 0, issues }
}

export function validateSeatZoneInput(
  input: SeatZoneWriteInput,
  zones: readonly SeatZone[] = [],
  floors: readonly SeatFloor[] = [],
  ticketGates: readonly Pick<TicketGate, 'id'>[] = [],
  excludedId?: string,
): SeatZoneValidationResult {
  const value = sanitizeSeatZoneInput(input)
  const issues: SeatZoneValidationIssue[] = []

  if (!value.code) issues.push({ field: 'code', code: 'required', message: '请输入分区编号' })
  else if (!/^[A-Z0-9-]{2,10}$/.test(value.code)) {
    issues.push({ field: 'code', code: 'invalid', message: '分区编号须为 2–10 位字母、数字或连字符' })
  } else if (zones.some((item) => item.id !== excludedId && identity(item.code) === identity(value.code))) {
    issues.push({ field: 'code', code: 'duplicate', message: '分区编号不能重复' })
  }

  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入区域名称' })
  else if (Array.from(value.name).length > 80) issues.push({ field: 'name', code: 'too_long', message: '区域名称不能超过 80 个字符' })

  if (!value.floorId) issues.push({ field: 'floorId', code: 'required', message: '请选择所属楼层' })
  else if (!floors.some((item) => item.id === value.floorId)) {
    issues.push({ field: 'floorId', code: 'not_found', message: '所选楼层不存在' })
  }

  if (!Number.isInteger(value.rowStart) || value.rowStart < 1 || value.rowStart > 200) {
    issues.push({ field: 'rowStart', code: 'invalid', message: '起始排号须为 1–200 的整数' })
  }
  if (!Number.isInteger(value.rowEnd) || value.rowEnd < 1 || value.rowEnd > 200) {
    issues.push({ field: 'rowEnd', code: 'invalid', message: '结束排号须为 1–200 的整数' })
  } else if (Number.isInteger(value.rowStart) && value.rowEnd <= value.rowStart) {
    issues.push({ field: 'rowEnd', code: 'invalid', message: '结束排号必须大于起始排号' })
  }

  if (!Number.isInteger(value.sortOrder) || value.sortOrder <= 0) {
    issues.push({ field: 'sortOrder', code: 'positive_integer', message: '排序须为大于 0 的整数' })
  }

  if (value.gateIds.length === 0) issues.push({ field: 'gateIds', code: 'required', message: '请至少选择一个检票口' })
  else {
    const validGateIds = new Set(ticketGates.map((item) => item.id))
    if (value.gateIds.some((id) => !validGateIds.has(id))) {
      issues.push({ field: 'gateIds', code: 'not_found', message: '所选检票口不存在，请重新选择' })
    }
  }

  if (Array.from(value.remark).length > 300) {
    issues.push({ field: 'remark', code: 'too_long', message: '备注不能超过 300 个字符' })
  }

  return { valid: issues.length === 0, issues }
}

export function sortSeatFloors(floors: readonly SeatFloor[]): SeatFloor[] {
  return [...floors]
    .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name, 'zh-CN', { numeric: true }))
    .map(cloneFloor)
}

export function sortSeatZones(zones: readonly SeatZone[], floors: readonly SeatFloor[]): SeatZone[] {
  const floorOrder = new Map(sortSeatFloors(floors).map((floor, index) => [floor.id, index]))
  return [...zones]
    .sort((first, second) => (floorOrder.get(first.floorId) ?? Number.MAX_SAFE_INTEGER) - (floorOrder.get(second.floorId) ?? Number.MAX_SAFE_INTEGER) ||
      first.sortOrder - second.sortOrder || first.code.localeCompare(second.code, 'zh-CN', { numeric: true }))
    .map(cloneZone)
}

function defaultFloors(timestamp: string): SeatFloor[] {
  return [
    { id: 'seat-floor-first', name: '一层', sortOrder: 1, createdAt: timestamp, updatedAt: timestamp },
    { id: 'seat-floor-second', name: '二层', sortOrder: 2, createdAt: timestamp, updatedAt: timestamp },
  ]
}

export class LocalSeatPlanningService implements SeatPlanningService {
  private readonly injectedStorage?: Storage
  private readonly gateService: TicketGateService
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalSeatPlanningServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.gateService = options.gateService ?? ticketGateService
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveStorage()
  }

  private readMain(): StoredSeatPlanning {
    const raw = this.storage.getItem(SEAT_PLANNING_STORAGE_KEY)
    if (!raw) {
      const timestamp = this.now().toISOString()
      const initial: StoredSeatPlanning = { schemaVersion: SCHEMA_VERSION, floors: defaultFloors(timestamp), zones: [], auditLogs: [] }
      this.writeMain(initial)
      return initial
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSeatPlanning>
      if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.floors) || !parsed.floors.every(isFloor) ||
        !Array.isArray(parsed.zones) || !parsed.zones.every(isZone) ||
        !Array.isArray(parsed.auditLogs) || !parsed.auditLogs.every(isAudit)) throw new Error('Invalid seat planning data')
      return {
        schemaVersion: SCHEMA_VERSION,
        floors: parsed.floors.map(cloneFloor),
        zones: parsed.zones.map(cloneZone),
        auditLogs: parsed.auditLogs.map(cloneAudit),
      }
    } catch (error) {
      throw new SeatPlanningServiceError('本地座位规划数据无法解析', { cause: error })
    }
  }

  private readBindings(): SeatZoneGateBinding[] {
    const raw = this.storage.getItem(SEAT_ZONE_GATE_BINDING_STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as Partial<StoredSeatZoneBindings>
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records) || !parsed.records.every(isBinding)) {
        throw new Error('Invalid seat zone bindings')
      }
      return parsed.records.map(cloneBinding)
    } catch (error) {
      throw new SeatPlanningServiceError('座位分区与检票口绑定数据无法解析', { cause: error })
    }
  }

  private writeMain(envelope: StoredSeatPlanning): void {
    this.storage.setItem(SEAT_PLANNING_STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      floors: envelope.floors.map(cloneFloor),
      zones: envelope.zones.map(cloneZone),
      auditLogs: envelope.auditLogs.map(cloneAudit),
    } satisfies StoredSeatPlanning))
  }

  private writeBindings(bindings: readonly SeatZoneGateBinding[]): void {
    this.storage.setItem(SEAT_ZONE_GATE_BINDING_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      records: bindings.map(cloneBinding),
    } satisfies StoredSeatZoneBindings))
  }

  private restore(key: string, raw: string | null): void {
    try {
      if (raw === null) this.storage.removeItem(key)
      else this.storage.setItem(key, raw)
    } catch {
      // Best-effort rollback: retain the original failure as the actionable error.
    }
  }

  private commit(envelope: StoredSeatPlanning, bindings?: readonly SeatZoneGateBinding[]): void {
    const previousMain = this.storage.getItem(SEAT_PLANNING_STORAGE_KEY)
    const previousBindings = bindings ? this.storage.getItem(SEAT_ZONE_GATE_BINDING_STORAGE_KEY) : null
    try {
      this.writeMain(envelope)
      if (bindings) this.writeBindings(bindings)
    } catch (error) {
      this.restore(SEAT_PLANNING_STORAGE_KEY, previousMain)
      if (bindings) this.restore(SEAT_ZONE_GATE_BINDING_STORAGE_KEY, previousBindings)
      throw new SeatPlanningServiceError('座位规划保存失败，原数据已恢复', { cause: error })
    }
  }

  private audit(
    envelope: StoredSeatPlanning,
    action: SeatPlanningAuditAction,
    entityId: string,
    entityCode: string,
    targetId: string | null = null,
  ): void {
    envelope.auditLogs.push({ id: this.createId(), action, entityId, entityCode, targetId, createdAt: this.now().toISOString() })
    if (envelope.auditLogs.length > MAX_AUDIT_LOGS) envelope.auditLogs.splice(0, envelope.auditLogs.length - MAX_AUDIT_LOGS)
  }

  private snapshot(
    envelope: StoredSeatPlanning,
    bindings: readonly SeatZoneGateBinding[],
    ticketGates: readonly TicketGate[],
  ): SeatPlanningSnapshot {
    return {
      floors: sortSeatFloors(envelope.floors),
      zones: sortSeatZones(envelope.zones, envelope.floors),
      bindings: bindings.map(cloneBinding),
      ticketGates: ticketGates.map(cloneGate),
    }
  }

  private async gates(): Promise<TicketGate[]> {
    return (await this.gateService.list()).map(cloneGate)
  }

  async load(): Promise<SeatPlanningSnapshot> {
    const envelope = this.readMain()
    const bindings = this.readBindings()
    const ticketGates = await this.gates()
    const zoneCodes = new Set(envelope.zones.map((item) => item.code))
    const gateIds = new Set(ticketGates.map((item) => item.id))
    const seen = new Set<string>()
    const validBindings: SeatZoneGateBinding[] = []
    const removed: SeatZoneGateBinding[] = []

    for (const binding of bindings) {
      const key = `${binding.zoneCode}\u0000${binding.gateId}`
      if (!zoneCodes.has(binding.zoneCode) || !gateIds.has(binding.gateId) || seen.has(key)) removed.push(binding)
      else {
        seen.add(key)
        validBindings.push(binding)
      }
    }

    if (removed.length) {
      removed.forEach((binding) => this.audit(envelope, 'unbind-gate', binding.id, binding.zoneCode, binding.gateId))
      this.commit(envelope, validBindings)
    }
    return this.snapshot(envelope, validBindings, ticketGates)
  }

  async listAuditLogs(): Promise<SeatPlanningAuditLog[]> {
    return this.readMain().auditLogs.map(cloneAudit).sort((first, second) => second.createdAt.localeCompare(first.createdAt))
  }

  async createFloor(input: SeatFloorWriteInput): Promise<SeatFloor> {
    const envelope = this.readMain()
    const value = sanitizeSeatFloorInput(input)
    const validation = validateSeatFloorInput(value, envelope.floors)
    if (!validation.valid) throw new SeatPlanningServiceError(validation.issues[0]!.message)
    const timestamp = this.now().toISOString()
    const floor: SeatFloor = {
      id: this.createId(),
      name: value.name,
      sortOrder: envelope.floors.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    envelope.floors.push(floor)
    this.audit(envelope, 'create-floor', floor.id, floor.name)
    this.commit(envelope)
    return cloneFloor(floor)
  }

  async removeFloor(id: string): Promise<void> {
    const envelope = this.readMain()
    const floor = envelope.floors.find((item) => item.id === id)
    if (!floor) throw new SeatPlanningServiceError('未找到要删除的楼层')
    const zoneCount = envelope.zones.filter((item) => item.floorId === id).length
    if (zoneCount > 0) throw new SeatPlanningServiceError(`楼层已绑定 ${zoneCount} 个座位分区，无法删除`)
    envelope.floors = envelope.floors.filter((item) => item.id !== id)
    this.audit(envelope, 'delete-floor', floor.id, floor.name)
    this.commit(envelope)
  }

  async createZone(input: SeatZoneWriteInput): Promise<SeatPlanningSnapshot> {
    const envelope = this.readMain()
    const bindings = this.readBindings()
    const ticketGates = await this.gates()
    const value = sanitizeSeatZoneInput(input)
    const validation = validateSeatZoneInput(value, envelope.zones, envelope.floors, ticketGates)
    if (!validation.valid) throw new SeatPlanningServiceError(validation.issues[0]!.message)
    const timestamp = this.now().toISOString()
    const zone: SeatZone = {
      id: this.createId(), code: value.code, name: value.name, floorId: value.floorId,
      rowStart: value.rowStart, rowEnd: value.rowEnd, sortOrder: value.sortOrder,
      status: value.status, remark: value.remark, createdAt: timestamp, updatedAt: timestamp,
    }
    const nextBindings = [...bindings]
    value.gateIds.forEach((gateId) => {
      const binding: SeatZoneGateBinding = { id: this.createId(), zoneCode: zone.code, gateId }
      nextBindings.push(binding)
      this.audit(envelope, 'bind-gate', zone.id, zone.code, gateId)
    })
    envelope.zones.push(zone)
    this.audit(envelope, 'create-zone', zone.id, zone.code)
    this.commit(envelope, nextBindings)
    return this.snapshot(envelope, nextBindings, ticketGates)
  }

  async updateZone(id: string, input: SeatZoneWriteInput): Promise<SeatPlanningSnapshot> {
    const envelope = this.readMain()
    const index = envelope.zones.findIndex((item) => item.id === id)
    if (index < 0) throw new SeatPlanningServiceError('未找到要更新的座位分区')
    const previous = envelope.zones[index]!
    const ticketGates = await this.gates()
    const value = sanitizeSeatZoneInput({ ...input, code: previous.code })
    const validation = validateSeatZoneInput(value, envelope.zones, envelope.floors, ticketGates, id)
    if (!validation.valid) throw new SeatPlanningServiceError(validation.issues[0]!.message)
    const bindings = this.readBindings()
    const selectedGateIds = new Set(value.gateIds)
    const currentBindings = bindings.filter((item) => item.zoneCode === previous.code)
    const currentGateIds = new Set(currentBindings.map((item) => item.gateId))
    const removedBindings = currentBindings.filter((item) => !selectedGateIds.has(item.gateId))
    const nextBindings = bindings.filter((item) => item.zoneCode !== previous.code || selectedGateIds.has(item.gateId))

    removedBindings.forEach((binding) => this.audit(envelope, 'unbind-gate', previous.id, previous.code, binding.gateId))
    value.gateIds.filter((gateId) => !currentGateIds.has(gateId)).forEach((gateId) => {
      nextBindings.push({ id: this.createId(), zoneCode: previous.code, gateId })
      this.audit(envelope, 'bind-gate', previous.id, previous.code, gateId)
    })

    const zone: SeatZone = {
      id, code: previous.code, name: value.name, floorId: value.floorId,
      rowStart: value.rowStart, rowEnd: value.rowEnd, sortOrder: value.sortOrder,
      status: value.status, remark: value.remark, createdAt: previous.createdAt, updatedAt: this.now().toISOString(),
    }
    envelope.zones[index] = zone
    this.audit(envelope, 'update-zone', zone.id, zone.code)
    this.commit(envelope, nextBindings)
    return this.snapshot(envelope, nextBindings, ticketGates)
  }

  async updateZoneStatus(id: string, status: SeatZoneStatus): Promise<SeatZone> {
    if (!['enabled', 'disabled'].includes(status)) throw new SeatPlanningServiceError('请选择有效的分区状态')
    const envelope = this.readMain()
    const index = envelope.zones.findIndex((item) => item.id === id)
    if (index < 0) throw new SeatPlanningServiceError('未找到要更新状态的座位分区')
    const previous = envelope.zones[index]!
    const zone: SeatZone = { ...previous, status, updatedAt: this.now().toISOString() }
    envelope.zones[index] = zone
    this.audit(envelope, 'status-update', zone.id, zone.code)
    this.commit(envelope)
    return cloneZone(zone)
  }

  async removeZone(id: string): Promise<SeatPlanningSnapshot> {
    const envelope = this.readMain()
    const zone = envelope.zones.find((item) => item.id === id)
    if (!zone) throw new SeatPlanningServiceError('未找到要删除的座位分区')
    if (zone.status === 'enabled') throw new SeatPlanningServiceError('启用中的分区需先停用再删除')
    const ticketGates = await this.gates()
    const bindings = this.readBindings()
    const removedBindings = bindings.filter((item) => item.zoneCode === zone.code)
    const nextBindings = bindings.filter((item) => item.zoneCode !== zone.code)
    removedBindings.forEach((binding) => this.audit(envelope, 'unbind-gate', zone.id, zone.code, binding.gateId))
    envelope.zones = envelope.zones.filter((item) => item.id !== id)
    this.audit(envelope, 'delete-zone', zone.id, zone.code)
    this.commit(envelope, nextBindings)
    return this.snapshot(envelope, nextBindings, ticketGates)
  }
}

export const seatPlanningService: SeatPlanningService = new LocalSeatPlanningService()
