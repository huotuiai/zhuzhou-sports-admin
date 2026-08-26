import type {
  ShuttleDirection,
  ShuttleOperatingStatus,
  ShuttleRoute,
  ShuttleRouteCreateInput,
  ShuttleRouteService,
  ShuttleRouteUpdateInput,
  ShuttleRouteValidationIssue,
  ShuttleStation,
  ShuttleStationValidationIssue,
  ValidationResult,
} from '../types'
import { isValidGeoPoint } from '@/components/map/geometry'
import { createClientId } from '@/lib/id'

export const SHUTTLE_ROUTE_STORAGE_KEY = 'zz-sports-shuttle-routes:v2'
export const LEGACY_SHUTTLE_ROUTE_STORAGE_KEY = 'zz-sports-shuttle-routes:v1'
export const LEGACY_SHUTTLE_POINT_STORAGE_KEY = 'zz-sports-shuttle-points:v1'
const SCHEMA_VERSION = 2
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

interface StoredShuttleRoutes {
  schemaVersion: typeof SCHEMA_VERSION
  records: ShuttleRoute[]
}

type LegacyShuttleStation = Omit<ShuttleStation, 'arrivalGateIds'>
type LegacyShuttleRoute = Omit<ShuttleRoute, 'stations'> & { stations: LegacyShuttleStation[] }

export interface LocalShuttleRouteServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

export class ShuttleRouteServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ShuttleRouteServiceError'
  }
}

function resolveStorage(): Storage {
  if (!globalThis.localStorage) throw new ShuttleRouteServiceError('当前环境不支持本地存储')
  return globalThis.localStorage
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function normalizedIdentity(value: string): string {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

function isDirection(value: unknown): value is ShuttleDirection {
  return value === 'inbound' || value === 'outbound'
}

function isOperatingStatus(value: unknown): value is ShuttleOperatingStatus {
  return value === 'operating' || value === 'suspended' || value === 'partial'
}

function isLegacyStation(value: unknown): value is LegacyShuttleStation {
  if (!value || typeof value !== 'object') return false
  const station = value as Record<string, unknown>
  return typeof station.id === 'string' && typeof station.name === 'string' &&
    (station.point === null || (typeof station.point === 'object' && isValidGeoPoint(station.point as { lng: number, lat: number }))) &&
    typeof station.navigationAddress === 'string' &&
    (station.arrivalOffsetMinutes === null || (Number.isInteger(station.arrivalOffsetMinutes) && Number(station.arrivalOffsetMinutes) >= 0))
}

function isStation(value: unknown): value is ShuttleStation {
  if (!isLegacyStation(value)) return false
  const station = value as unknown as Record<string, unknown>
  return Array.isArray(station.arrivalGateIds) && station.arrivalGateIds.every((id) => typeof id === 'string' && Boolean(id.trim()))
}

function isRouteRecord(value: unknown, stationGuard: (station: unknown) => boolean): boolean {
  if (!value || typeof value !== 'object') return false
  const route = value as Record<string, unknown>
  return typeof route.id === 'string' && typeof route.code === 'string' && /^[A-Z0-9]{2,10}$/i.test(route.code) &&
    typeof route.name === 'string' && Boolean(route.name.trim()) && isDirection(route.direction) && typeof route.description === 'string' &&
    typeof route.firstDeparture === 'string' && TIME_PATTERN.test(route.firstDeparture) &&
    typeof route.lastDeparture === 'string' && TIME_PATTERN.test(route.lastDeparture) && route.firstDeparture < route.lastDeparture &&
    Number.isInteger(route.departureIntervalMinutes) && Number(route.departureIntervalMinutes) >= 5 &&
    Number.isInteger(route.durationMinutes) && Number(route.durationMinutes) > 0 && isOperatingStatus(route.operatingStatus) &&
    (route.realtimeStatusText === undefined || typeof route.realtimeStatusText === 'string') &&
    Number.isInteger(route.sortOrder) && Number(route.sortOrder) >= 0 && typeof route.enabled === 'boolean' &&
    Array.isArray(route.stations) && route.stations.length <= 20 && route.stations.every(stationGuard) &&
    route.coordinateSystem === 'GCJ-02' && typeof route.createdAt === 'string' && typeof route.updatedAt === 'string'
}

function isRoute(value: unknown): value is ShuttleRoute {
  return isRouteRecord(value, isStation)
}

function isLegacyRoute(value: unknown): value is LegacyShuttleRoute {
  return isRouteRecord(value, isLegacyStation)
}

function cloneStation(station: ShuttleStation): ShuttleStation {
  return { ...station, point: station.point ? { ...station.point } : null, arrivalGateIds: [...station.arrivalGateIds] }
}

function cloneRoute(route: ShuttleRoute): ShuttleRoute {
  return { ...route, realtimeStatusText: route.realtimeStatusText ?? '', stations: route.stations.map(cloneStation) }
}

export function sortShuttleRoutes(records: readonly ShuttleRoute[]): ShuttleRoute[] {
  return [...records]
    .sort((first, second) => first.sortOrder - second.sortOrder || second.updatedAt.localeCompare(first.updatedAt) || first.code.localeCompare(second.code))
    .map(cloneRoute)
}

export function sanitizeShuttleRouteBaseInput(input: ShuttleRouteUpdateInput): ShuttleRouteUpdateInput {
  return {
    name: normalizeText(input.name),
    direction: input.direction,
    description: normalizeText(input.description),
    firstDeparture: input.firstDeparture.trim(),
    lastDeparture: input.lastDeparture.trim(),
    departureIntervalMinutes: Number(input.departureIntervalMinutes),
    durationMinutes: Number(input.durationMinutes),
    operatingStatus: input.operatingStatus,
    realtimeStatusText: normalizeText(input.realtimeStatusText),
    sortOrder: Number(input.sortOrder),
    enabled: Boolean(input.enabled),
  }
}

export function sanitizeShuttleRouteCreateInput(input: ShuttleRouteCreateInput): ShuttleRouteCreateInput {
  return { ...sanitizeShuttleRouteBaseInput(input), code: normalizeText(input.code).toUpperCase() }
}

export function sanitizeShuttleStations(stations: readonly ShuttleStation[]): ShuttleStation[] {
  return stations.map((station) => ({
    id: station.id,
    name: normalizeText(station.name),
    point: station.point ? { lng: Number(station.point.lng), lat: Number(station.point.lat) } : null,
    navigationAddress: normalizeText(station.navigationAddress),
    arrivalOffsetMinutes: station.arrivalOffsetMinutes === null ? null : Number(station.arrivalOffsetMinutes),
    arrivalGateIds: [...new Set(station.arrivalGateIds.map((id) => id.trim()).filter(Boolean))],
  }))
}

function migrateLegacy(records: readonly LegacyShuttleRoute[]): ShuttleRoute[] {
  return records.map((route) => ({
    ...route,
    realtimeStatusText: route.realtimeStatusText ?? '',
    stations: route.stations.map((station) => ({
      ...station,
      point: station.point ? { ...station.point } : null,
      arrivalGateIds: [],
    })),
  }))
}

function validateBase(input: ShuttleRouteUpdateInput): ShuttleRouteValidationIssue[] {
  const value = sanitizeShuttleRouteBaseInput(input)
  const issues: ShuttleRouteValidationIssue[] = []
  const hasFirst = TIME_PATTERN.test(value.firstDeparture)
  const hasLast = TIME_PATTERN.test(value.lastDeparture)
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入线路名称' })
  if (!isDirection(value.direction)) issues.push({ field: 'direction', code: 'invalid', message: '请选择线路方向' })
  if (!hasFirst) issues.push({ field: 'firstDeparture', code: 'required', message: '请选择首班时间' })
  if (!hasLast) issues.push({ field: 'lastDeparture', code: 'required', message: '请选择末班时间' })
  if (hasFirst && hasLast && value.firstDeparture >= value.lastDeparture) {
    issues.push({ field: 'schedule', code: 'range', message: '首班时间必须早于末班时间' })
  }
  if (!Number.isInteger(value.departureIntervalMinutes) || value.departureIntervalMinutes < 5) {
    issues.push({ field: 'departureIntervalMinutes', code: 'range', message: '发车间隔必须是不小于 5 的整数' })
  }
  if (!Number.isInteger(value.durationMinutes) || value.durationMinutes <= 0) {
    issues.push({ field: 'durationMinutes', code: 'range', message: '全程时长必须是正整数' })
  }
  if (!isOperatingStatus(value.operatingStatus)) issues.push({ field: 'operatingStatus', code: 'invalid', message: '请选择运营状态' })
  if (!Number.isInteger(value.sortOrder) || value.sortOrder < 0) issues.push({ field: 'sortOrder', code: 'range', message: '排序号必须是非负整数' })
  return issues
}

export function validateShuttleRouteCreateInput(
  input: ShuttleRouteCreateInput,
  records: readonly ShuttleRoute[] = [],
): ValidationResult<ShuttleRouteValidationIssue> {
  const value = sanitizeShuttleRouteCreateInput(input)
  const issues = validateBase(value)
  if (!value.code) issues.unshift({ field: 'code', code: 'required', message: '请输入线路编号' })
  else if (!/^[A-Z0-9]{2,10}$/.test(value.code)) issues.unshift({ field: 'code', code: 'invalid', message: '线路编号须为 2–10 位字母或数字' })
  else if (records.some((item) => normalizedIdentity(item.code) === normalizedIdentity(value.code))) {
    issues.unshift({ field: 'code', code: 'duplicate', message: '线路编号不能重复' })
  }
  return { valid: issues.length === 0, issues }
}

export function validateShuttleRouteUpdateInput(input: ShuttleRouteUpdateInput): ValidationResult<ShuttleRouteValidationIssue> {
  const issues = validateBase(input)
  return { valid: issues.length === 0, issues }
}

export function validateShuttleStations(stationsInput: readonly ShuttleStation[]): ValidationResult<ShuttleStationValidationIssue> {
  const stations = sanitizeShuttleStations(stationsInput)
  const issues: ShuttleStationValidationIssue[] = []
  if (stations.length > 20) issues.push({ field: 'stations', code: 'limit', message: '每条线路最多配置 20 个站点' })
  for (const station of stations) {
    if (!station.name) issues.push({ field: 'name', stationId: station.id, code: 'required', message: '请输入站点名称' })
    if (!station.point) issues.push({ field: 'point', stationId: station.id, code: 'required', message: '请输入站点定位经纬度' })
    else if (!isValidGeoPoint(station.point)) issues.push({ field: 'point', stationId: station.id, code: 'invalid', message: '请输入合法的经度,纬度' })
    if (station.arrivalOffsetMinutes !== null && (!Number.isInteger(station.arrivalOffsetMinutes) || station.arrivalOffsetMinutes < 0)) {
      issues.push({ field: 'arrivalOffsetMinutes', stationId: station.id, code: 'invalid', message: '到达偏移必须是非负整数' })
    }
  }
  return { valid: issues.length === 0, issues }
}

export class LocalShuttleRouteService implements ShuttleRouteService {
  private readonly injectedStorage?: Storage
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalShuttleRouteServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveStorage()
  }

  private read(): ShuttleRoute[] {
    const raw = this.storage.getItem(SHUTTLE_ROUTE_STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<StoredShuttleRoutes>
        if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.records) || !parsed.records.every(isRoute)) {
          throw new Error('Invalid shuttle route data')
        }
        return parsed.records.map(cloneRoute)
      }
      catch (error) {
        throw new ShuttleRouteServiceError('本地接驳线路数据无法解析', { cause: error })
      }
    }

    const legacyRaw = this.storage.getItem(LEGACY_SHUTTLE_ROUTE_STORAGE_KEY)
    if (!legacyRaw) return []
    try {
      const parsed = JSON.parse(legacyRaw) as { schemaVersion?: unknown, records?: unknown }
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records) || !parsed.records.every(isLegacyRoute)) {
        throw new Error('Invalid legacy shuttle route data')
      }
      const migrated = migrateLegacy(parsed.records)
      this.write(migrated)
      return migrated.map(cloneRoute)
    }
    catch (error) {
      throw new ShuttleRouteServiceError('旧版接驳线路数据无法迁移', { cause: error })
    }
  }

  private write(records: readonly ShuttleRoute[]): void {
    this.storage.setItem(SHUTTLE_ROUTE_STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      records: records.map(cloneRoute),
    } satisfies StoredShuttleRoutes))
  }

  async list(): Promise<ShuttleRoute[]> {
    return sortShuttleRoutes(this.read())
  }

  async create(input: ShuttleRouteCreateInput): Promise<ShuttleRoute> {
    const records = this.read()
    const validation = validateShuttleRouteCreateInput(input, records)
    if (!validation.valid) throw new ShuttleRouteServiceError(validation.issues[0]!.message)
    const timestamp = this.now().toISOString()
    const record: ShuttleRoute = {
      ...sanitizeShuttleRouteCreateInput(input),
      id: this.createId(),
      stations: [],
      coordinateSystem: 'GCJ-02',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    records.push(record)
    this.write(records)
    return cloneRoute(record)
  }

  async update(id: string, input: ShuttleRouteUpdateInput): Promise<ShuttleRoute> {
    const records = this.read()
    const index = records.findIndex((item) => item.id === id)
    if (index < 0) throw new ShuttleRouteServiceError('接驳线路不存在')
    const validation = validateShuttleRouteUpdateInput(input)
    if (!validation.valid) throw new ShuttleRouteServiceError(validation.issues[0]!.message)
    const previous = records[index]!
    const record: ShuttleRoute = {
      ...previous,
      ...sanitizeShuttleRouteBaseInput(input),
      code: previous.code,
      stations: previous.stations.map(cloneStation),
      updatedAt: this.now().toISOString(),
    }
    records[index] = record
    this.write(records)
    return cloneRoute(record)
  }

  async replaceStations(id: string, stationsInput: readonly ShuttleStation[]): Promise<ShuttleRoute> {
    const records = this.read()
    const index = records.findIndex((item) => item.id === id)
    if (index < 0) throw new ShuttleRouteServiceError('接驳线路不存在')
    const validation = validateShuttleStations(stationsInput)
    if (!validation.valid) throw new ShuttleRouteServiceError(validation.issues[0]!.message)
    const previous = records[index]!
    const record: ShuttleRoute = {
      ...previous,
      stations: sanitizeShuttleStations(stationsInput),
      updatedAt: this.now().toISOString(),
    }
    records[index] = record
    this.write(records)
    return cloneRoute(record)
  }

  async remove(id: string): Promise<void> {
    const records = this.read()
    if (!records.some((item) => item.id === id)) throw new ShuttleRouteServiceError('接驳线路不存在')
    this.write(records.filter((item) => item.id !== id))
  }
}

export const shuttleRouteService: ShuttleRouteService = new LocalShuttleRouteService()
