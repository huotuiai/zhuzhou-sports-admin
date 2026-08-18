import type { MapGeometry } from '@/components/map/types'
import type { TrafficControl, TrafficControlService, TrafficControlType, TrafficControlValidationIssue, TrafficControlValidationResult, TrafficControlWriteInput } from '../types'
import { calculateGeometryAreaSquareMeters, cloneGeometry, validateGeometry } from '@/components/map/geometry'
import { createClientId } from '@/lib/id'

export const TRAFFIC_CONTROL_STORAGE_KEY = 'zz-sports-traffic-controls:v1'
export const LEGACY_AREA_CONTROL_STORAGE_KEY = 'zz-sports-control-zones:v1'
const SCHEMA_VERSION = 1

interface StoredTrafficControls {
  schemaVersion: typeof SCHEMA_VERSION
  lastSequence: number
  records: TrafficControl[]
}

export interface LocalTrafficControlServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

export class TrafficControlServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TrafficControlServiceError'
  }
}

function resolveStorage(): Storage {
  if (!globalThis.localStorage) throw new TrafficControlServiceError('当前环境不支持本地存储')
  return globalThis.localStorage
}

function text(value: string): string {
  return value.trim().normalize('NFKC')
}

function isType(value: unknown): value is TrafficControlType {
  return ['road-closure', 'restriction', 'detour', 'temporary', 'other'].includes(String(value))
}

function isGeometry(value: unknown): value is MapGeometry {
  if (!value || typeof value !== 'object') return false
  try {
    return validateGeometry(value as MapGeometry).valid
  }
  catch {
    return false
  }
}

function isRecord(value: unknown): value is TrafficControl {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && /^GZ-\d{3,}$/.test(String(item.code)) &&
    typeof item.title === 'string' && isType(item.type) && typeof item.areaName === 'string' &&
    typeof item.startAt === 'string' && typeof item.endAt === 'string' && typeof item.detourInstructions === 'string' &&
    (item.geometry === null || isGeometry(item.geometry)) &&
    (item.areaSquareMeters === null || (typeof item.areaSquareMeters === 'number' && item.areaSquareMeters > 0)) &&
    typeof item.pinned === 'boolean' && Number.isInteger(item.sortOrder) && Number(item.sortOrder) >= 0 &&
    item.coordinateSystem === 'GCJ-02' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function cloneRecord(record: TrafficControl): TrafficControl {
  return { ...record, geometry: record.geometry ? cloneGeometry(record.geometry) : null }
}

export function sortTrafficControls(records: readonly TrafficControl[]): TrafficControl[] {
  return [...records]
    .sort((first, second) => Number(second.pinned) - Number(first.pinned) || first.sortOrder - second.sortOrder || second.startAt.localeCompare(first.startAt))
    .map(cloneRecord)
}

export function sanitizeTrafficControlInput(input: TrafficControlWriteInput): TrafficControlWriteInput {
  return {
    title: text(input.title),
    type: input.type,
    areaName: text(input.areaName),
    startAt: input.startAt.trim(),
    endAt: input.endAt.trim(),
    detourInstructions: text(input.detourInstructions),
    geometry: input.geometry ? cloneGeometry(input.geometry) : null,
    pinned: Boolean(input.pinned),
    sortOrder: Number(input.sortOrder),
  }
}

export function validateTrafficControlInput(
  input: TrafficControlWriteInput,
  options: { mode?: 'create' | 'edit', now?: Date } = {},
): TrafficControlValidationResult {
  const value = sanitizeTrafficControlInput(input)
  const issues: TrafficControlValidationIssue[] = []
  const start = Date.parse(value.startAt)
  const end = Date.parse(value.endAt)

  if (!value.title) issues.push({ field: 'title', code: 'required', message: '请输入管制标题' })
  else if (value.title.length < 2 || value.title.length > 50) issues.push({ field: 'title', code: 'length', message: '标题长度须为 2–50 个字符' })
  if (!isType(value.type)) issues.push({ field: 'type', code: 'invalid', message: '请选择有效的管制类型' })
  if (!value.areaName) issues.push({ field: 'areaName', code: 'required', message: '请输入区域名称' })
  if (!value.startAt || !Number.isFinite(start)) issues.push({ field: 'startAt', code: 'required', message: '请选择有效的开始时间' })
  if (!value.endAt || !Number.isFinite(end)) issues.push({ field: 'endAt', code: 'required', message: '请选择有效的结束时间' })
  if (Number.isFinite(start) && Number.isFinite(end) && start >= end) issues.push({ field: 'dateRange', code: 'range', message: '开始时间必须早于结束时间' })
  if ((options.mode ?? 'create') === 'create' && Number.isFinite(end) && end <= (options.now ?? new Date()).getTime()) {
    issues.push({ field: 'endAt', code: 'range', message: '新增管制的结束时间必须晚于当前时间' })
  }
  if (!Number.isInteger(value.sortOrder) || value.sortOrder < 0) issues.push({ field: 'sortOrder', code: 'invalid', message: '排序号必须是非负整数' })
  if (value.geometry) {
    const result = validateGeometry(value.geometry)
    if (!result.valid || calculateGeometryAreaSquareMeters(value.geometry) <= 0) {
      issues.push({ field: 'geometry', code: 'invalid', message: result.reason ?? '区域面积必须大于零' })
    }
  }
  return { valid: issues.length === 0, issues }
}

export class LocalTrafficControlService implements TrafficControlService {
  private readonly injectedStorage?: Storage
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalTrafficControlServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveStorage()
  }

  private read(): StoredTrafficControls {
    const raw = this.storage.getItem(TRAFFIC_CONTROL_STORAGE_KEY)
    if (!raw) return { schemaVersion: SCHEMA_VERSION, lastSequence: 0, records: [] }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredTrafficControls>
      if (parsed.schemaVersion !== SCHEMA_VERSION || !Number.isInteger(parsed.lastSequence) || Number(parsed.lastSequence) < 0 ||
        !Array.isArray(parsed.records) || !parsed.records.every(isRecord)) throw new Error('Invalid traffic control data')
      return { schemaVersion: SCHEMA_VERSION, lastSequence: parsed.lastSequence!, records: parsed.records.map(cloneRecord) }
    }
    catch (error) {
      throw new TrafficControlServiceError('本地交通管制数据无法解析', { cause: error })
    }
  }

  private write(envelope: StoredTrafficControls): void {
    this.storage.setItem(TRAFFIC_CONTROL_STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      lastSequence: envelope.lastSequence,
      records: envelope.records.map(cloneRecord),
    } satisfies StoredTrafficControls))
  }

  async list(): Promise<TrafficControl[]> {
    return sortTrafficControls(this.read().records)
  }

  async create(input: TrafficControlWriteInput): Promise<TrafficControl> {
    const envelope = this.read()
    const validation = validateTrafficControlInput(input, { mode: 'create', now: this.now() })
    if (!validation.valid) throw new TrafficControlServiceError(validation.issues[0]!.message)
    const value = sanitizeTrafficControlInput(input)
    const maximumExistingSequence = envelope.records.reduce((maximum, item) => {
      const sequence = Number.parseInt(item.code.slice(3), 10)
      return Number.isFinite(sequence) ? Math.max(maximum, sequence) : maximum
    }, 0)
    envelope.lastSequence = Math.max(envelope.lastSequence, maximumExistingSequence) + 1
    const timestamp = this.now().toISOString()
    const record: TrafficControl = {
      ...value,
      id: this.createId(),
      code: `GZ-${String(envelope.lastSequence).padStart(3, '0')}`,
      areaSquareMeters: value.geometry ? calculateGeometryAreaSquareMeters(value.geometry) : null,
      coordinateSystem: 'GCJ-02',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    envelope.records.push(record)
    this.write(envelope)
    return cloneRecord(record)
  }

  async update(id: string, input: TrafficControlWriteInput): Promise<TrafficControl> {
    const envelope = this.read()
    const index = envelope.records.findIndex((item) => item.id === id)
    if (index < 0) throw new TrafficControlServiceError('交通管制记录不存在')
    const validation = validateTrafficControlInput(input, { mode: 'edit', now: this.now() })
    if (!validation.valid) throw new TrafficControlServiceError(validation.issues[0]!.message)
    const previous = envelope.records[index]!
    const value = sanitizeTrafficControlInput(input)
    const record: TrafficControl = {
      ...previous,
      ...value,
      areaSquareMeters: value.geometry ? calculateGeometryAreaSquareMeters(value.geometry) : null,
      updatedAt: this.now().toISOString(),
    }
    envelope.records[index] = record
    this.write(envelope)
    return cloneRecord(record)
  }

  async remove(id: string): Promise<void> {
    const envelope = this.read()
    if (!envelope.records.some((item) => item.id === id)) throw new TrafficControlServiceError('交通管制记录不存在')
    envelope.records = envelope.records.filter((item) => item.id !== id)
    this.write(envelope)
  }
}

export const trafficControlService = new LocalTrafficControlService()
