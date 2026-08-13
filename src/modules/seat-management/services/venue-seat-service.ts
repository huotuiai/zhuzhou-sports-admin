import type {
  VenueSeat,
  VenueSeatService,
  VenueSeatValidationIssue,
  VenueSeatValidationResult,
  VenueSeatWriteInput,
} from '../types'
import { createClientId } from '@/lib/id'

export const VENUE_SEAT_STORAGE_KEY = 'zz-sports-venue-seats:v1'
const SCHEMA_VERSION = 1

interface StoredVenueSeats {
  schemaVersion: typeof SCHEMA_VERSION
  records: VenueSeat[]
}

export class VenueSeatServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'VenueSeatServiceError'
  }
}

export interface LocalVenueSeatServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

function resolveStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new VenueSeatServiceError('当前环境不支持本地存储')
  }
  return globalThis.localStorage
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function identity(value: string): string {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

export function sanitizeVenueSeatInput(input: VenueSeatWriteInput): VenueSeatWriteInput {
  return {
    ...input,
    code: normalizeText(input.code),
    venueArea: normalizeText(input.venueArea),
    section: normalizeText(input.section),
    rowNumber: normalizeText(input.rowNumber),
    seatNumber: normalizeText(input.seatNumber),
    remark: normalizeText(input.remark),
  }
}

export function validateVenueSeatInput(
  input: VenueSeatWriteInput,
  records: readonly VenueSeat[] = [],
  excludedId?: string,
): VenueSeatValidationResult {
  const value = sanitizeVenueSeatInput(input)
  const issues: VenueSeatValidationIssue[] = []

  if (!value.code) {
    issues.push({ field: 'code', code: 'required', message: '请输入座位编码' })
  } else if (records.some((item) => item.id !== excludedId && identity(item.code) === identity(value.code))) {
    issues.push({ field: 'code', code: 'duplicate', message: '座位编码不能重复' })
  }
  if (!value.venueArea) issues.push({ field: 'venueArea', code: 'required', message: '请输入场馆区域' })
  if (!value.section) issues.push({ field: 'section', code: 'required', message: '请输入看台分区' })
  if (!value.rowNumber) issues.push({ field: 'rowNumber', code: 'required', message: '请输入排号' })
  if (!value.seatNumber) issues.push({ field: 'seatNumber', code: 'required', message: '请输入座号' })
  if (Array.from(value.remark).length > 300) {
    issues.push({ field: 'remark', code: 'too_long', message: '备注不能超过 300 个字符' })
  }
  return { valid: issues.length === 0, issues }
}

function clone(record: VenueSeat): VenueSeat {
  return { ...record }
}

function isVenueSeat(value: unknown): value is VenueSeat {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.code === 'string' &&
    typeof item.venueArea === 'string' && typeof item.section === 'string' &&
    typeof item.rowNumber === 'string' && typeof item.seatNumber === 'string' &&
    ['standard', 'vip', 'accessible'].includes(String(item.type)) &&
    ['available', 'disabled', 'maintenance'].includes(String(item.status)) &&
    typeof item.remark === 'string' && typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
}

export function sortVenueSeats(records: readonly VenueSeat[]): VenueSeat[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone)
}

export class LocalVenueSeatService implements VenueSeatService {
  private readonly injectedStorage?: Storage
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalVenueSeatServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveStorage()
  }

  private read(): VenueSeat[] {
    const raw = this.storage.getItem(VENUE_SEAT_STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as Partial<StoredVenueSeats>
      if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.records) || !parsed.records.every(isVenueSeat)) {
        throw new Error('Invalid venue seat data')
      }
      return parsed.records.map(clone)
    } catch (error) {
      throw new VenueSeatServiceError('本地座位数据无法解析', { cause: error })
    }
  }

  private write(records: readonly VenueSeat[]): void {
    const data: StoredVenueSeats = { schemaVersion: SCHEMA_VERSION, records: records.map(clone) }
    this.storage.setItem(VENUE_SEAT_STORAGE_KEY, JSON.stringify(data))
  }

  async list(): Promise<VenueSeat[]> {
    return sortVenueSeats(this.read())
  }

  async create(input: VenueSeatWriteInput): Promise<VenueSeat> {
    const records = this.read()
    const value = sanitizeVenueSeatInput(input)
    const validation = validateVenueSeatInput(value, records)
    if (!validation.valid) throw new VenueSeatServiceError(validation.issues[0]!.message)
    const timestamp = this.now().toISOString()
    const record: VenueSeat = { ...value, id: this.createId(), createdAt: timestamp, updatedAt: timestamp }
    this.write([...records, record])
    return clone(record)
  }

  async update(id: string, input: VenueSeatWriteInput): Promise<VenueSeat> {
    const records = this.read()
    const index = records.findIndex((item) => item.id === id)
    if (index < 0) throw new VenueSeatServiceError('未找到要更新的座位')
    const value = sanitizeVenueSeatInput(input)
    const validation = validateVenueSeatInput(value, records, id)
    if (!validation.valid) throw new VenueSeatServiceError(validation.issues[0]!.message)
    const previous = records[index]!
    const record: VenueSeat = { ...value, id, createdAt: previous.createdAt, updatedAt: this.now().toISOString() }
    records[index] = record
    this.write(records)
    return clone(record)
  }

  async remove(id: string): Promise<void> {
    const records = this.read()
    const next = records.filter((item) => item.id !== id)
    if (next.length === records.length) throw new VenueSeatServiceError('未找到要删除的座位')
    this.write(next)
  }
}

// 后端接口就绪后，实现 VenueSeatService 并在此替换实例即可。
export const venueSeatService: VenueSeatService = new LocalVenueSeatService()
