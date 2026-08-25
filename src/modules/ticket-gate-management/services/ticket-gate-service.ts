import type {
  GeoPoint,
  TicketGate,
  TicketGateAuditAction,
  TicketGateAuditLog,
  TicketGateService,
  TicketGateStatus,
  TicketGateStatusInput,
  TicketGateValidationIssue,
  TicketGateValidationResult,
  TicketGateWriteInput,
} from '../types'
import { createClientId } from '@/lib/id'

export const TICKET_GATE_STORAGE_KEY = 'zz-sports-ticket-gates:v2'
export const LEGACY_TICKET_GATE_STORAGE_KEY = 'zz-sports-ticket-gates:v1'
const SCHEMA_VERSION = 2

interface StoredTicketGates {
  schemaVersion: typeof SCHEMA_VERSION
  records: TicketGate[]
  auditLogs: TicketGateAuditLog[]
}

interface LegacyTicketGate {
  id: string
  name: string
  code: string
  venueArea: string
  location: string
  enabled: boolean
  remark: string
  createdAt: string
  updatedAt: string
}

export class TicketGateServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TicketGateServiceError'
  }
}

export interface LocalTicketGateServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

function resolveStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new TicketGateServiceError('当前环境不支持本地存储')
  }
  return globalThis.localStorage
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function identity(value: string): string {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

function isFinitePoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return typeof point.lng === 'number' && Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180 &&
    typeof point.lat === 'number' && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
}

export function parseMapCoordinates(value: string): GeoPoint[] {
  const source = value.trim()
  if (!source) return []
  if (!source.startsWith('[')) {
    const coordinateParts = source.split(',').map((item) => item.trim())
    const point = { lng: Number(coordinateParts[0]), lat: Number(coordinateParts[1]) }
    if (coordinateParts.length !== 2 || coordinateParts.some((item) => !item) || !isFinitePoint(point)) {
      throw new TicketGateServiceError('定位格式应为“经度, 纬度”')
    }
    return [point]
  }
  const parsed: unknown = JSON.parse(source)
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isFinitePoint)) {
    throw new TicketGateServiceError('地图坐标必须是包含有效 lng、lat 的 JSON 数组')
  }
  return parsed.map((point) => ({ lng: point.lng, lat: point.lat }))
}

export function formatMapCoordinates(points: readonly GeoPoint[]): string {
  if (points.length === 1) return `${points[0]!.lng}, ${points[0]!.lat}`
  return points.length ? JSON.stringify(points) : ''
}

function clonePoint(point: GeoPoint | null): GeoPoint | null {
  return point ? { ...point } : null
}

function cloneGate(record: TicketGate): TicketGate {
  return {
    ...record,
    mapPoints: record.mapPoints.map((point) => ({ ...point })),
    navigationPoint: clonePoint(record.navigationPoint),
  }
}

function cloneAudit(log: TicketGateAuditLog): TicketGateAuditLog {
  return { ...log }
}

export function sanitizeTicketGateInput(input: TicketGateWriteInput): TicketGateWriteInput {
  const statusRemark = input.status === 'open' ? '' : normalizeText(input.statusRemark)
  return {
    code: normalizeText(input.code).toUpperCase(),
    name: normalizeText(input.name),
    floor: input.floor,
    locationDescription: normalizeText(input.locationDescription),
    mapCoordinates: input.mapCoordinates.trim(),
    navigationAddress: normalizeText(input.navigationAddress),
    navigationLongitude: input.navigationLongitude,
    navigationLatitude: input.navigationLatitude,
    sortOrder: input.sortOrder,
    status: input.status,
    statusRemark,
  }
}

export function validateTicketGateInput(
  input: TicketGateWriteInput,
  records: readonly TicketGate[] = [],
  excludedId?: string,
): TicketGateValidationResult {
  const value = sanitizeTicketGateInput(input)
  const issues: TicketGateValidationIssue[] = []

  if (!value.code) issues.push({ field: 'code', code: 'required', message: '请输入检票口编号' })
  else if (!/^[A-Z0-9-]{2,10}$/.test(value.code)) {
    issues.push({ field: 'code', code: 'invalid', message: '编号须为 2–10 位字母、数字或连字符' })
  } else if (records.some((item) => item.id !== excludedId && identity(item.code) === identity(value.code))) {
    issues.push({ field: 'code', code: 'duplicate', message: '检票口编号不能重复' })
  }

  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入检票口名称' })
  else if (records.some((item) => item.id !== excludedId && identity(item.name) === identity(value.name))) {
    issues.push({ field: 'name', code: 'duplicate', message: '检票口名称不能重复' })
  }

  if (!['一层', '二层'].includes(value.floor)) {
    issues.push({ field: 'floor', code: 'invalid', message: '请选择有效楼层' })
  }

  if (!value.mapCoordinates) {
    issues.push({ field: 'mapCoordinates', code: 'required', message: '请输入定位（经纬度）' })
  } else {
    try {
      if (parseMapCoordinates(value.mapCoordinates).length !== 1) {
        issues.push({ field: 'mapCoordinates', code: 'invalid', message: '定位只能填写一组经纬度' })
      }
    } catch {
      issues.push({ field: 'mapCoordinates', code: 'invalid', message: '定位格式应为“经度, 纬度”' })
    }
  }

  const hasLongitude = value.navigationLongitude !== null && Number.isFinite(value.navigationLongitude)
  const hasLatitude = value.navigationLatitude !== null && Number.isFinite(value.navigationLatitude)
  if (hasLongitude !== hasLatitude) {
    issues.push({ field: hasLongitude ? 'navigationLatitude' : 'navigationLongitude', code: 'invalid', message: '导航经纬度必须成对填写' })
  } else if (hasLongitude && hasLatitude && !isFinitePoint({ lng: value.navigationLongitude, lat: value.navigationLatitude })) {
    issues.push({ field: 'navigationLongitude', code: 'invalid', message: '请输入有效的导航经纬度' })
  }
  if (!Number.isInteger(value.sortOrder) || value.sortOrder <= 0) {
    issues.push({ field: 'sortOrder', code: 'positive_integer', message: '排序号必须是大于 0 的整数' })
  }

  return { valid: issues.length === 0, issues }
}

function toRecord(input: TicketGateWriteInput): Omit<TicketGate, 'id' | 'createdAt' | 'updatedAt'> {
  const value = sanitizeTicketGateInput(input)
  const hasNavigationPoint = value.navigationLongitude !== null && value.navigationLatitude !== null &&
    Number.isFinite(value.navigationLongitude) && Number.isFinite(value.navigationLatitude)
  return {
    code: value.code,
    name: value.name,
    floor: value.floor,
    locationDescription: value.locationDescription,
    mapPoints: parseMapCoordinates(value.mapCoordinates),
    navigationAddress: value.navigationAddress,
    navigationPoint: hasNavigationPoint
      ? { lng: value.navigationLongitude!, lat: value.navigationLatitude! }
      : null,
    sortOrder: value.sortOrder,
    status: value.status,
    statusRemark: value.statusRemark,
  }
}

function isStatus(value: unknown): value is TicketGateStatus {
  return value === 'open' || value === 'closed' || value === 'restricted'
}

function isTicketGate(value: unknown): value is TicketGate {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.code === 'string' && typeof item.name === 'string' &&
    (item.floor === '一层' || item.floor === '二层') && typeof item.locationDescription === 'string' &&
    Array.isArray(item.mapPoints) && item.mapPoints.every(isFinitePoint) &&
    typeof item.navigationAddress === 'string' && (item.navigationPoint === null || isFinitePoint(item.navigationPoint)) &&
    typeof item.sortOrder === 'number' && Number.isInteger(item.sortOrder) && item.sortOrder > 0 &&
    isStatus(item.status) && typeof item.statusRemark === 'string' &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isAuditLog(value: unknown): value is TicketGateAuditLog {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.gateId === 'string' && typeof item.gateCode === 'string' &&
    ['create', 'update', 'status-update', 'delete'].includes(String(item.action)) && typeof item.createdAt === 'string'
}

function isLegacyTicketGate(value: unknown): value is LegacyTicketGate {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.code === 'string' &&
    typeof item.venueArea === 'string' && typeof item.location === 'string' && typeof item.enabled === 'boolean' &&
    typeof item.remark === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

export function sortTicketGates(records: readonly TicketGate[]): TicketGate[] {
  return [...records]
    .sort((first, second) => first.sortOrder - second.sortOrder || first.code.localeCompare(second.code, 'zh-CN', { numeric: true }))
    .map(cloneGate)
}

function migrateLegacy(records: readonly LegacyTicketGate[]): TicketGate[] {
  return records.map((record, index) => ({
    id: record.id,
    code: normalizeText(record.code).toUpperCase(),
    name: normalizeText(record.name),
    floor: `${record.venueArea} ${record.location}`.includes('二层') ? '二层' : '一层',
    locationDescription: normalizeText(record.location),
    mapPoints: [],
    navigationAddress: '',
    navigationPoint: null,
    sortOrder: index + 1,
    status: record.enabled ? 'open' : 'closed',
    statusRemark: record.enabled ? '' : normalizeText(record.remark),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }))
}

export class LocalTicketGateService implements TicketGateService {
  private readonly injectedStorage?: Storage
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalTicketGateServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveStorage()
  }

  private write(envelope: StoredTicketGates): void {
    this.storage.setItem(TICKET_GATE_STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      records: envelope.records.map(cloneGate),
      auditLogs: envelope.auditLogs.map(cloneAudit),
    } satisfies StoredTicketGates))
  }

  private read(): StoredTicketGates {
    const raw = this.storage.getItem(TICKET_GATE_STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<StoredTicketGates>
        if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.records) || !parsed.records.every(isTicketGate) ||
          !Array.isArray(parsed.auditLogs) || !parsed.auditLogs.every(isAuditLog)) throw new Error('Invalid ticket gate data')
        return { schemaVersion: SCHEMA_VERSION, records: parsed.records.map(cloneGate), auditLogs: parsed.auditLogs.map(cloneAudit) }
      } catch (error) {
        throw new TicketGateServiceError('本地检票口数据无法解析', { cause: error })
      }
    }

    const legacyRaw = this.storage.getItem(LEGACY_TICKET_GATE_STORAGE_KEY)
    if (!legacyRaw) return { schemaVersion: SCHEMA_VERSION, records: [], auditLogs: [] }
    try {
      const parsed = JSON.parse(legacyRaw) as { schemaVersion?: unknown, records?: unknown }
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records) || !parsed.records.every(isLegacyTicketGate)) {
        throw new Error('Invalid legacy ticket gate data')
      }
      const migrated: StoredTicketGates = { schemaVersion: SCHEMA_VERSION, records: migrateLegacy(parsed.records), auditLogs: [] }
      this.write(migrated)
      return migrated
    } catch (error) {
      throw new TicketGateServiceError('旧版检票口数据无法迁移', { cause: error })
    }
  }

  private appendAudit(envelope: StoredTicketGates, gate: Pick<TicketGate, 'id' | 'code'>, action: TicketGateAuditAction): void {
    envelope.auditLogs.push({ id: this.createId(), gateId: gate.id, gateCode: gate.code, action, createdAt: this.now().toISOString() })
    if (envelope.auditLogs.length > 500) envelope.auditLogs.splice(0, envelope.auditLogs.length - 500)
  }

  async list(): Promise<TicketGate[]> {
    return sortTicketGates(this.read().records)
  }

  async listAuditLogs(): Promise<TicketGateAuditLog[]> {
    return this.read().auditLogs.map(cloneAudit).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async create(input: TicketGateWriteInput): Promise<TicketGate> {
    const envelope = this.read()
    const validation = validateTicketGateInput(input, envelope.records)
    if (!validation.valid) throw new TicketGateServiceError(validation.issues[0]!.message)
    const timestamp = this.now().toISOString()
    const record: TicketGate = { ...toRecord(input), id: this.createId(), createdAt: timestamp, updatedAt: timestamp }
    envelope.records.push(record)
    this.appendAudit(envelope, record, 'create')
    this.write(envelope)
    return cloneGate(record)
  }

  async update(id: string, input: TicketGateWriteInput): Promise<TicketGate> {
    const envelope = this.read()
    const index = envelope.records.findIndex((item) => item.id === id)
    if (index < 0) throw new TicketGateServiceError('未找到要更新的检票口')
    const previous = envelope.records[index]!
    const immutableCodeInput = { ...input, code: previous.code }
    const validation = validateTicketGateInput(immutableCodeInput, envelope.records, id)
    if (!validation.valid) throw new TicketGateServiceError(validation.issues[0]!.message)
    const record: TicketGate = {
      ...toRecord(immutableCodeInput),
      id,
      createdAt: previous.createdAt,
      updatedAt: this.now().toISOString(),
    }
    envelope.records[index] = record
    this.appendAudit(envelope, record, 'update')
    this.write(envelope)
    return cloneGate(record)
  }

  async updateStatus(id: string, input: TicketGateStatusInput): Promise<TicketGate> {
    const envelope = this.read()
    const index = envelope.records.findIndex((item) => item.id === id)
    if (index < 0) throw new TicketGateServiceError('未找到要更新状态的检票口')
    if (!isStatus(input.status)) throw new TicketGateServiceError('请选择有效的检票口状态')
    const previous = envelope.records[index]!
    const record: TicketGate = {
      ...previous,
      status: input.status,
      statusRemark: input.status === 'open' ? '' : normalizeText(input.statusRemark),
      updatedAt: this.now().toISOString(),
    }
    envelope.records[index] = record
    this.appendAudit(envelope, record, 'status-update')
    this.write(envelope)
    return cloneGate(record)
  }

  async remove(id: string): Promise<void> {
    const envelope = this.read()
    const record = envelope.records.find((item) => item.id === id)
    if (!record) throw new TicketGateServiceError('未找到要删除的检票口')
    envelope.records = envelope.records.filter((item) => item.id !== id)
    this.appendAudit(envelope, record, 'delete')
    this.write(envelope)
  }
}

export const ticketGateService: TicketGateService = new LocalTicketGateService()
