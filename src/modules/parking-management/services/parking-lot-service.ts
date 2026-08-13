import type {
  ParkingLot,
  ParkingLotService,
  ParkingLotValidationIssue,
  ParkingLotValidationResult,
  ParkingLotWriteInput,
} from '../types'
import { createClientId } from '@/lib/id'

export const PARKING_LOT_STORAGE_KEY = 'zz-sports-parking-lots:v1'
export const PARKING_LOT_SCHEMA_VERSION = 1

interface StoredParkingLots {
  schemaVersion: typeof PARKING_LOT_SCHEMA_VERSION
  records: ParkingLot[]
}

export type ParkingLotServiceErrorCode =
  | 'invalid_name'
  | 'invalid_code'
  | 'duplicate_code'
  | 'invalid_total_spaces'
  | 'remark_too_long'
  | 'not_found'
  | 'storage_unavailable'
  | 'storage_corrupted'

export class ParkingLotServiceError extends Error {
  readonly code: ParkingLotServiceErrorCode

  constructor(code: ParkingLotServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ParkingLotServiceError'
    this.code = code
  }
}

export interface LocalParkingLotServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

function resolveBrowserStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new ParkingLotServiceError('storage_unavailable', '当前环境不支持本地存储')
  }
  return globalThis.localStorage
}

function defaultCreateId(): string {
  return createClientId()
}

export function normalizeParkingLotText(value: string): string {
  return value.trim().normalize('NFKC')
}

export function parkingLotCodeIdentity(code: string): string {
  return normalizeParkingLotText(code).toLocaleLowerCase('zh-CN')
}

export function sanitizeParkingLotInput(input: ParkingLotWriteInput): ParkingLotWriteInput {
  return {
    name: normalizeParkingLotText(input.name),
    code: normalizeParkingLotText(input.code),
    address: normalizeParkingLotText(input.address),
    totalSpaces: input.totalSpaces,
    enabled: input.enabled,
    remark: normalizeParkingLotText(input.remark),
  }
}

export function validateParkingLotInput(
  input: ParkingLotWriteInput,
  records: readonly ParkingLot[] = [],
  excludedId?: string,
): ParkingLotValidationResult {
  const sanitized = sanitizeParkingLotInput(input)
  const issues: ParkingLotValidationIssue[] = []

  if (!sanitized.name) {
    issues.push({ field: 'name', code: 'required', message: '请输入停车场名称' })
  }
  if (!sanitized.code) {
    issues.push({ field: 'code', code: 'required', message: '请输入停车场编码' })
  } else {
    const identity = parkingLotCodeIdentity(sanitized.code)
    if (
      records.some(
        (record) => record.id !== excludedId && parkingLotCodeIdentity(record.code) === identity,
      )
    ) {
      issues.push({ field: 'code', code: 'duplicate', message: '停车场编码不能重复' })
    }
  }
  if (!Number.isFinite(sanitized.totalSpaces)) {
    issues.push({
      field: 'totalSpaces',
      code: 'required',
      message: '请输入车位总数',
    })
  } else if (!Number.isInteger(sanitized.totalSpaces) || sanitized.totalSpaces < 0) {
    issues.push({
      field: 'totalSpaces',
      code: 'non_negative_integer',
      message: '车位总数必须是大于或等于 0 的整数',
    })
  }
  if (Array.from(sanitized.remark).length > 300) {
    issues.push({ field: 'remark', code: 'too_long', message: '备注不能超过 300 个字符' })
  }

  return { valid: issues.length === 0, issues }
}

function throwForFirstIssue(issue: ParkingLotValidationIssue): never {
  if (issue.field === 'name') {
    throw new ParkingLotServiceError('invalid_name', issue.message)
  }
  if (issue.field === 'code') {
    throw new ParkingLotServiceError(
      issue.code === 'duplicate' ? 'duplicate_code' : 'invalid_code',
      issue.message,
    )
  }
  if (issue.field === 'totalSpaces') {
    throw new ParkingLotServiceError('invalid_total_spaces', issue.message)
  }
  throw new ParkingLotServiceError('remark_too_long', issue.message)
}

function cloneParkingLot(record: ParkingLot): ParkingLot {
  return { ...record }
}

export function sortParkingLotsByUpdatedAt(records: readonly ParkingLot[]): ParkingLot[] {
  return [...records]
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .map(cloneParkingLot)
}

function isParkingLot(value: unknown): value is ParkingLot {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.code === 'string' &&
    typeof record.address === 'string' &&
    typeof record.totalSpaces === 'number' &&
    Number.isInteger(record.totalSpaces) &&
    record.totalSpaces >= 0 &&
    typeof record.enabled === 'boolean' &&
    typeof record.remark === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  )
}

export class LocalParkingLotService implements ParkingLotService {
  private readonly injectedStorage: Storage | undefined
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalParkingLotServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? defaultCreateId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveBrowserStorage()
  }

  private read(): ParkingLot[] {
    const raw = this.storage.getItem(PARKING_LOT_STORAGE_KEY)
    if (!raw) return []

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid storage envelope')
      const envelope = parsed as Record<string, unknown>
      if (
        envelope.schemaVersion !== PARKING_LOT_SCHEMA_VERSION ||
        !Array.isArray(envelope.records) ||
        !envelope.records.every(isParkingLot)
      ) {
        throw new Error('Unsupported or invalid storage schema')
      }
      return envelope.records.map(cloneParkingLot)
    } catch (error) {
      throw new ParkingLotServiceError('storage_corrupted', '本地停车场数据无法解析', {
        cause: error,
      })
    }
  }

  private write(records: readonly ParkingLot[]): void {
    const envelope: StoredParkingLots = {
      schemaVersion: PARKING_LOT_SCHEMA_VERSION,
      records: records.map(cloneParkingLot),
    }
    this.storage.setItem(PARKING_LOT_STORAGE_KEY, JSON.stringify(envelope))
  }

  async list(): Promise<ParkingLot[]> {
    return sortParkingLotsByUpdatedAt(this.read())
  }

  async create(input: ParkingLotWriteInput): Promise<ParkingLot> {
    const records = this.read()
    const sanitized = sanitizeParkingLotInput(input)
    const validation = validateParkingLotInput(sanitized, records)
    if (!validation.valid) throwForFirstIssue(validation.issues[0]!)

    const timestamp = this.now().toISOString()
    const record: ParkingLot = {
      ...sanitized,
      id: this.createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.write([...records, record])
    return cloneParkingLot(record)
  }

  async update(id: string, input: ParkingLotWriteInput): Promise<ParkingLot> {
    const records = this.read()
    const index = records.findIndex((record) => record.id === id)
    if (index < 0) throw new ParkingLotServiceError('not_found', '未找到要更新的停车场')

    const sanitized = sanitizeParkingLotInput(input)
    const validation = validateParkingLotInput(sanitized, records, id)
    if (!validation.valid) throwForFirstIssue(validation.issues[0]!)

    const previous = records[index]!
    const record: ParkingLot = {
      ...sanitized,
      id,
      createdAt: previous.createdAt,
      updatedAt: this.now().toISOString(),
    }
    const nextRecords = [...records]
    nextRecords[index] = record
    this.write(nextRecords)
    return cloneParkingLot(record)
  }

  async remove(id: string): Promise<void> {
    const records = this.read()
    const nextRecords = records.filter((record) => record.id !== id)
    if (nextRecords.length === records.length) {
      throw new ParkingLotServiceError('not_found', '未找到要删除的停车场')
    }
    this.write(nextRecords)
  }
}

export function createLocalParkingLotService(
  options: LocalParkingLotServiceOptions = {},
): ParkingLotService {
  return new LocalParkingLotService(options)
}

export const parkingLotService = createLocalParkingLotService()
