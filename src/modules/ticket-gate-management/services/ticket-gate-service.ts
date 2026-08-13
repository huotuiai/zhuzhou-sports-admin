import type {
  TicketGate,
  TicketGateService,
  TicketGateValidationIssue,
  TicketGateValidationResult,
  TicketGateWriteInput,
} from '../types'
import { createClientId } from '@/lib/id'

export const TICKET_GATE_STORAGE_KEY = 'zz-sports-ticket-gates:v1'
const SCHEMA_VERSION = 1

interface StoredTicketGates {
  schemaVersion: typeof SCHEMA_VERSION
  records: TicketGate[]
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

function codeIdentity(value: string): string {
  return normalizeText(value).toLocaleLowerCase('zh-CN')
}

export function sanitizeTicketGateInput(input: TicketGateWriteInput): TicketGateWriteInput {
  return {
    ...input,
    name: normalizeText(input.name),
    code: normalizeText(input.code),
    venueArea: normalizeText(input.venueArea),
    location: normalizeText(input.location),
    remark: normalizeText(input.remark),
  }
}

export function validateTicketGateInput(
  input: TicketGateWriteInput,
  records: readonly TicketGate[] = [],
  excludedId?: string,
): TicketGateValidationResult {
  const value = sanitizeTicketGateInput(input)
  const issues: TicketGateValidationIssue[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入检票口名称' })
  if (!value.code) {
    issues.push({ field: 'code', code: 'required', message: '请输入检票口编码' })
  } else if (records.some((item) => item.id !== excludedId && codeIdentity(item.code) === codeIdentity(value.code))) {
    issues.push({ field: 'code', code: 'duplicate', message: '检票口编码不能重复' })
  }
  if (!value.venueArea) issues.push({ field: 'venueArea', code: 'required', message: '请输入所属区域' })
  if (!Number.isInteger(value.laneCount) || value.laneCount <= 0) {
    issues.push({ field: 'laneCount', code: 'positive_integer', message: '通道数必须是大于 0 的整数' })
  }
  if (!Number.isInteger(value.deviceCount) || value.deviceCount < 0) {
    issues.push({ field: 'deviceCount', code: 'non_negative_integer', message: '设备数必须是大于或等于 0 的整数' })
  }
  if (Array.from(value.remark).length > 300) {
    issues.push({ field: 'remark', code: 'too_long', message: '备注不能超过 300 个字符' })
  }
  return { valid: issues.length === 0, issues }
}

function clone(record: TicketGate): TicketGate {
  return { ...record }
}

function isTicketGate(value: unknown): value is TicketGate {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' &&
    typeof item.code === 'string' && typeof item.venueArea === 'string' &&
    typeof item.location === 'string' && ['entry', 'exit', 'bidirectional'].includes(String(item.direction)) &&
    typeof item.laneCount === 'number' && Number.isInteger(item.laneCount) && item.laneCount > 0 &&
    typeof item.deviceCount === 'number' && Number.isInteger(item.deviceCount) && item.deviceCount >= 0 &&
    typeof item.enabled === 'boolean' && typeof item.remark === 'string' &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

export function sortTicketGates(records: readonly TicketGate[]): TicketGate[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone)
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

  private read(): TicketGate[] {
    const raw = this.storage.getItem(TICKET_GATE_STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as Partial<StoredTicketGates>
      if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.records) || !parsed.records.every(isTicketGate)) {
        throw new Error('Invalid ticket gate data')
      }
      return parsed.records.map(clone)
    } catch (error) {
      throw new TicketGateServiceError('本地检票口数据无法解析', { cause: error })
    }
  }

  private write(records: readonly TicketGate[]): void {
    const data: StoredTicketGates = { schemaVersion: SCHEMA_VERSION, records: records.map(clone) }
    this.storage.setItem(TICKET_GATE_STORAGE_KEY, JSON.stringify(data))
  }

  async list(): Promise<TicketGate[]> {
    return sortTicketGates(this.read())
  }

  async create(input: TicketGateWriteInput): Promise<TicketGate> {
    const records = this.read()
    const value = sanitizeTicketGateInput(input)
    const validation = validateTicketGateInput(value, records)
    if (!validation.valid) throw new TicketGateServiceError(validation.issues[0]!.message)
    const timestamp = this.now().toISOString()
    const record: TicketGate = { ...value, id: this.createId(), createdAt: timestamp, updatedAt: timestamp }
    this.write([...records, record])
    return clone(record)
  }

  async update(id: string, input: TicketGateWriteInput): Promise<TicketGate> {
    const records = this.read()
    const index = records.findIndex((item) => item.id === id)
    if (index < 0) throw new TicketGateServiceError('未找到要更新的检票口')
    const value = sanitizeTicketGateInput(input)
    const validation = validateTicketGateInput(value, records, id)
    if (!validation.valid) throw new TicketGateServiceError(validation.issues[0]!.message)
    const previous = records[index]!
    const record: TicketGate = { ...value, id, createdAt: previous.createdAt, updatedAt: this.now().toISOString() }
    records[index] = record
    this.write(records)
    return clone(record)
  }

  async remove(id: string): Promise<void> {
    const records = this.read()
    const next = records.filter((item) => item.id !== id)
    if (next.length === records.length) throw new TicketGateServiceError('未找到要删除的检票口')
    this.write(next)
  }
}

// 后端接口就绪后，实现 TicketGateService 并在此替换实例即可。
export const ticketGateService: TicketGateService = new LocalTicketGateService()
