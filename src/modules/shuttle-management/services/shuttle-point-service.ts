import type {
  ShuttlePoint,
  ShuttlePointService,
  ShuttlePointValidationIssue,
  ShuttlePointValidationResult,
  ShuttlePointWriteInput,
  ShuttleStation,
  ShuttleVehicle,
} from '../types'
import { createClientId } from '@/lib/id'

export const SHUTTLE_POINT_STORAGE_KEY = 'zz-sports-shuttle-points:v1'
const SCHEMA_VERSION = 1

interface StoredShuttlePoints {
  schemaVersion: typeof SCHEMA_VERSION
  records: ShuttlePoint[]
}

export class ShuttlePointServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ShuttlePointServiceError'
  }
}

export interface LocalShuttlePointServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

function resolveStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') throw new ShuttlePointServiceError('当前环境不支持本地存储')
  return globalThis.localStorage
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function identity(value: string): string {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

function cloneStation(item: ShuttleStation): ShuttleStation {
  return { ...item }
}

function cloneVehicle(item: ShuttleVehicle): ShuttleVehicle {
  return { ...item }
}

function cloneWriteInput(input: ShuttlePointWriteInput): ShuttlePointWriteInput {
  return { ...input, stations: input.stations.map(cloneStation), vehicles: input.vehicles.map(cloneVehicle) }
}

function clone(record: ShuttlePoint): ShuttlePoint {
  return { ...record, stations: record.stations.map(cloneStation), vehicles: record.vehicles.map(cloneVehicle) }
}

export function sanitizeShuttlePointInput(input: ShuttlePointWriteInput): ShuttlePointWriteInput {
  return {
    ...cloneWriteInput(input),
    name: normalizeText(input.name),
    code: normalizeText(input.code),
    address: normalizeText(input.address),
    contactName: normalizeText(input.contactName),
    contactPhone: normalizeText(input.contactPhone),
    routeName: normalizeText(input.routeName),
    stations: input.stations.map((item) => ({ ...item, name: normalizeText(item.name) })),
    vehicles: input.vehicles.map((item) => ({ ...item, name: normalizeText(item.name), plateNumber: normalizeText(item.plateNumber).toUpperCase() })),
    firstDeparture: normalizeText(input.firstDeparture),
    lastDeparture: normalizeText(input.lastDeparture),
    remark: normalizeText(input.remark),
  }
}

export function validateShuttlePointInput(
  input: ShuttlePointWriteInput,
  records: readonly ShuttlePoint[] = [],
  excludedId?: string,
): ShuttlePointValidationResult {
  const value = sanitizeShuttlePointInput(input)
  const issues: ShuttlePointValidationIssue[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入接驳点名称' })
  if (!value.code) issues.push({ field: 'code', code: 'required', message: '请输入接驳点编码' })
  else if (records.some((item) => item.id !== excludedId && identity(item.code) === identity(value.code))) issues.push({ field: 'code', code: 'duplicate', message: '接驳点编码不能重复' })
  if (value.contactPhone && !/^(?:1\d{10}|0\d{2,3}-?\d{7,8})$/.test(value.contactPhone)) issues.push({ field: 'contactPhone', code: 'invalid', message: '请输入正确的手机号或固定电话' })
  if (!value.routeName) issues.push({ field: 'routeName', code: 'required', message: '请输入线路名称' })
  const stationNames = value.stations.map((item) => item.name).filter(Boolean)
  if (stationNames.length < 2 || stationNames.length !== value.stations.length) issues.push({ field: 'stations', code: 'required', message: '请至少配置 2 个完整的线路站点' })
  else if (new Set(stationNames.map(identity)).size !== stationNames.length) issues.push({ field: 'stations', code: 'duplicate', message: '同一线路内的站点名称不能重复' })
  const invalidVehicle = value.vehicles.some((item) => !item.name || !item.plateNumber || !Number.isInteger(item.capacity) || item.capacity <= 0)
  if (invalidVehicle) issues.push({ field: 'vehicles', code: 'required', message: '请完整填写车辆名称、车牌号和载客数' })
  else if (new Set(value.vehicles.map((item) => identity(item.plateNumber))).size !== value.vehicles.length) issues.push({ field: 'vehicles', code: 'duplicate', message: '车牌号不能重复' })
  if (!/^\d{2}:\d{2}$/.test(value.firstDeparture)) issues.push({ field: 'firstDeparture', code: 'required', message: '请设置首班发车时间' })
  if (!/^\d{2}:\d{2}$/.test(value.lastDeparture)) issues.push({ field: 'lastDeparture', code: 'required', message: '请设置末班发车时间' })
  if (value.firstDeparture && value.lastDeparture && value.firstDeparture >= value.lastDeparture) issues.push({ field: 'lastDeparture', code: 'invalid', message: '末班时间必须晚于首班时间' })
  if (!Number.isInteger(value.departureInterval) || value.departureInterval <= 0) issues.push({ field: 'departureInterval', code: 'positive_integer', message: '发车间隔必须是大于 0 的整数' })
  if (Array.from(value.remark).length > 300) issues.push({ field: 'remark', code: 'too_long', message: '备注不能超过 300 个字符' })
  return { valid: issues.length === 0, issues }
}

function isStation(value: unknown): value is ShuttleStation {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string'
}

function isVehicle(value: unknown): value is ShuttleVehicle {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.plateNumber === 'string' &&
    typeof item.capacity === 'number' && Number.isInteger(item.capacity) && item.capacity > 0
}

function isShuttlePoint(value: unknown): value is ShuttlePoint {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.code === 'string' &&
    typeof item.address === 'string' && typeof item.contactName === 'string' && typeof item.contactPhone === 'string' &&
    typeof item.routeName === 'string' && Array.isArray(item.stations) && item.stations.every(isStation) &&
    Array.isArray(item.vehicles) && item.vehicles.every(isVehicle) && typeof item.firstDeparture === 'string' &&
    typeof item.lastDeparture === 'string' && typeof item.departureInterval === 'number' &&
    Number.isInteger(item.departureInterval) && item.departureInterval > 0 && typeof item.enabled === 'boolean' &&
    typeof item.remark === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

export function sortShuttlePoints(records: readonly ShuttlePoint[]): ShuttlePoint[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone)
}

export class LocalShuttlePointService implements ShuttlePointService {
  private readonly injectedStorage?: Storage
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalShuttlePointServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage { return this.injectedStorage ?? resolveStorage() }

  private read(): ShuttlePoint[] {
    const raw = this.storage.getItem(SHUTTLE_POINT_STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as Partial<StoredShuttlePoints>
      if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.records) || !parsed.records.every(isShuttlePoint)) throw new Error('Invalid shuttle data')
      return parsed.records.map(clone)
    } catch (error) {
      throw new ShuttlePointServiceError('本地接驳点数据无法解析', { cause: error })
    }
  }

  private write(records: readonly ShuttlePoint[]): void {
    const data: StoredShuttlePoints = { schemaVersion: SCHEMA_VERSION, records: records.map(clone) }
    this.storage.setItem(SHUTTLE_POINT_STORAGE_KEY, JSON.stringify(data))
  }

  async list(): Promise<ShuttlePoint[]> { return sortShuttlePoints(this.read()) }

  async create(input: ShuttlePointWriteInput): Promise<ShuttlePoint> {
    const records = this.read()
    const value = sanitizeShuttlePointInput(input)
    const validation = validateShuttlePointInput(value, records)
    if (!validation.valid) throw new ShuttlePointServiceError(validation.issues[0]!.message)
    const timestamp = this.now().toISOString()
    const record: ShuttlePoint = { ...value, id: this.createId(), createdAt: timestamp, updatedAt: timestamp }
    this.write([...records, record])
    return clone(record)
  }

  async update(id: string, input: ShuttlePointWriteInput): Promise<ShuttlePoint> {
    const records = this.read()
    const index = records.findIndex((item) => item.id === id)
    if (index < 0) throw new ShuttlePointServiceError('未找到要更新的接驳点')
    const value = sanitizeShuttlePointInput(input)
    const validation = validateShuttlePointInput(value, records, id)
    if (!validation.valid) throw new ShuttlePointServiceError(validation.issues[0]!.message)
    const previous = records[index]!
    const record: ShuttlePoint = { ...value, id, createdAt: previous.createdAt, updatedAt: this.now().toISOString() }
    records[index] = record
    this.write(records)
    return clone(record)
  }

  async remove(id: string): Promise<void> {
    const records = this.read()
    const next = records.filter((item) => item.id !== id)
    if (next.length === records.length) throw new ShuttlePointServiceError('未找到要删除的接驳点')
    this.write(next)
  }
}

// 后端接口就绪后，实现 ShuttlePointService 并在此替换实例即可。
export const shuttlePointService: ShuttlePointService = new LocalShuttlePointService()
