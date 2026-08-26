import type {
  ParkingAvailabilityUpdateMethod,
  ParkingFeeType,
  ParkingLot,
  ParkingLotBaseInput,
  ParkingLotCreateInput,
  ParkingLotService,
  ParkingLotUpdateInput,
  ParkingLotUpdateOptions,
  ParkingLotValidationField,
  ParkingLotValidationIssue,
  ParkingLotValidationResult,
  ParkingOpenStatus,
} from '../types'
import { isValidGeoPoint } from '@/components/map/geometry'
import { createClientId } from '@/lib/id'

export const PARKING_LOT_STORAGE_KEY = 'zz-sports-parking-lots:v4'
export const LEGACY_V3_PARKING_LOT_STORAGE_KEY = 'zz-sports-parking-lots:v3'
export const LEGACY_V2_PARKING_LOT_STORAGE_KEY = 'zz-sports-parking-lots:v2'
export const LEGACY_PARKING_LOT_STORAGE_KEY = 'zz-sports-parking-lots:v1'
export const PARKING_LOT_SCHEMA_VERSION = 4

interface StoredParkingLots {
  schemaVersion: typeof PARKING_LOT_SCHEMA_VERSION
  records: ParkingLot[]
}

type LegacyV3ParkingLot = Omit<ParkingLot, 'availabilityUpdateMethod'>

interface StoredV3ParkingLots {
  schemaVersion: 3
  records: LegacyV3ParkingLot[]
}

type LegacyV2ParkingLot = Omit<ParkingLot, 'feeStandard' | 'availabilityUpdateMethod'> & { hourlyRateYuan: number | null }

interface StoredV2ParkingLots {
  schemaVersion: 2
  records: LegacyV2ParkingLot[]
}

interface LegacyParkingLot {
  id: string
  name: string
  code: string
  address: string
  totalSpaces: number
  enabled: boolean
  remark: string
  createdAt: string
  updatedAt: string
}

interface StoredLegacyParkingLots {
  schemaVersion: 1
  records: LegacyParkingLot[]
}

export type ParkingLotServiceErrorCode =
  | 'invalid_input'
  | 'duplicate_code'
  | 'available_exceeds_total'
  | 'invalid_available_spaces'
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

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function codeIdentity(code: string): string {
  return normalizeText(code).toLocaleUpperCase('en-US')
}

function clonePoint(point: ParkingLot['point']): ParkingLot['point'] {
  return point ? { lng: point.lng, lat: point.lat } : null
}

function cloneParkingLot(record: ParkingLot): ParkingLot {
  return { ...record, point: clonePoint(record.point) }
}

function isFeeType(value: unknown): value is ParkingFeeType {
  return value === 'free' || value === 'paid'
}

function isOpenStatus(value: unknown): value is ParkingOpenStatus {
  return value === 'open' || value === 'closed'
}

function isAvailabilityUpdateMethod(value: unknown): value is ParkingAvailabilityUpdateMethod {
  return value === 'integrated' || value === 'manual'
}

function characterCount(value: string): number {
  return Array.from(value).length
}

export function sanitizeParkingLotBaseInput(input: ParkingLotBaseInput): ParkingLotBaseInput {
  return {
    name: normalizeText(input.name),
    locationDescription: normalizeText(input.locationDescription),
    point: clonePoint(input.point),
    navigationAddress: normalizeText(input.navigationAddress),
    totalSpaces: Number(input.totalSpaces),
    availabilityUpdateMethod: input.availabilityUpdateMethod,
    feeType: input.feeType,
    feeStandard: input.feeType === 'free' ? '' : normalizeText(input.feeStandard),
    openStatus: input.openStatus,
    enabled: Boolean(input.enabled),
    recommendationWeight: Number(input.recommendationWeight),
    sortOrder: Number(input.sortOrder),
    remark: normalizeText(input.remark),
  }
}

export function sanitizeParkingLotCreateInput(input: ParkingLotCreateInput): ParkingLotCreateInput {
  return { ...sanitizeParkingLotBaseInput(input), code: codeIdentity(input.code) }
}

function pushLengthIssue(
  issues: ParkingLotValidationIssue[],
  field: ParkingLotValidationField,
  value: string,
  maximum: number,
  label: string,
): void {
  if (characterCount(value) > maximum) {
    issues.push({ field, code: 'too_long', message: `${label}不能超过 ${maximum} 个字符` })
  }
}

export function validateParkingLotBaseInput(input: ParkingLotBaseInput): ParkingLotValidationResult {
  const value = sanitizeParkingLotBaseInput(input)
  const issues: ParkingLotValidationIssue[] = []

  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入停车场名称' })
  else pushLengthIssue(issues, 'name', value.name, 50, '停车场名称')
  pushLengthIssue(issues, 'locationDescription', value.locationDescription, 100, '位置描述')
  pushLengthIssue(issues, 'navigationAddress', value.navigationAddress, 200, '导航地址')
  pushLengthIssue(issues, 'remark', value.remark, 300, '备注')

  if (!value.point) issues.push({ field: 'point', code: 'required', message: '请输入定位经纬度' })
  else if (!isValidGeoPoint(value.point)) issues.push({ field: 'point', code: 'invalid', message: '请输入合法的经度,纬度' })
  if (!Number.isInteger(value.totalSpaces) || value.totalSpaces <= 0) {
    issues.push({ field: 'totalSpaces', code: 'range', message: '总车位数必须是正整数' })
  }
  if (!isAvailabilityUpdateMethod(value.availabilityUpdateMethod)) {
    issues.push({ field: 'availabilityUpdateMethod', code: 'invalid', message: '请选择车位更新方式' })
  }
  if (!isFeeType(value.feeType)) {
    issues.push({ field: 'feeType', code: 'invalid', message: '请选择收费类型' })
  }
  else if (value.feeType === 'paid') {
    if (!value.feeStandard) issues.push({ field: 'feeStandard', code: 'required', message: '请输入收费标准' })
    else pushLengthIssue(issues, 'feeStandard', value.feeStandard, 300, '收费标准')
  }
  if (!isOpenStatus(value.openStatus)) {
    issues.push({ field: 'openStatus', code: 'invalid', message: '请选择开放状态' })
  }
  if (!Number.isInteger(value.recommendationWeight) || value.recommendationWeight < 0 || value.recommendationWeight > 100) {
    issues.push({ field: 'recommendationWeight', code: 'range', message: '推荐权重必须是 0–100 的整数' })
  }
  if (!Number.isInteger(value.sortOrder) || value.sortOrder < 0) {
    issues.push({ field: 'sortOrder', code: 'range', message: '排序号必须是非负整数' })
  }

  return { valid: issues.length === 0, issues }
}

export function validateParkingLotCreateInput(
  input: ParkingLotCreateInput,
  records: readonly ParkingLot[] = [],
): ParkingLotValidationResult {
  const value = sanitizeParkingLotCreateInput(input)
  const issues = [...validateParkingLotBaseInput(value).issues]
  if (!value.code) issues.unshift({ field: 'code', code: 'required', message: '请输入停车场编号' })
  else if (!/^[A-Z0-9-]{2,10}$/.test(value.code)) {
    issues.unshift({ field: 'code', code: 'invalid', message: '编号须为 2–10 位字母、数字或连字符' })
  }
  else if (records.some((record) => codeIdentity(record.code) === value.code)) {
    issues.unshift({ field: 'code', code: 'duplicate', message: '停车场编号不能重复' })
  }
  return { valid: issues.length === 0, issues }
}

function throwForValidation(issues: readonly ParkingLotValidationIssue[]): never {
  const issue = issues[0]!
  throw new ParkingLotServiceError(issue.code === 'duplicate' ? 'duplicate_code' : 'invalid_input', issue.message)
}

export function sortParkingLots(records: readonly ParkingLot[]): ParkingLot[] {
  return [...records]
    .sort((first, second) =>
      first.sortOrder - second.sortOrder ||
      second.updatedAt.localeCompare(first.updatedAt) ||
      first.code.localeCompare(second.code, 'zh-CN'),
    )
    .map(cloneParkingLot)
}

function isLegacyParkingLot(value: unknown): value is LegacyParkingLot {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.name === 'string' && typeof record.code === 'string' &&
    typeof record.address === 'string' && Number.isInteger(record.totalSpaces) && Number(record.totalSpaces) >= 0 &&
    typeof record.enabled === 'boolean' && typeof record.remark === 'string' &&
    typeof record.createdAt === 'string' && typeof record.updatedAt === 'string'
}

function isLegacyV3ParkingLot(value: unknown): value is LegacyV3ParkingLot {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const point = record.point
  return typeof record.id === 'string' && typeof record.code === 'string' && typeof record.name === 'string' &&
    typeof record.locationDescription === 'string' &&
    (point === null || (typeof point === 'object' && isValidGeoPoint(point as { lng: number, lat: number }))) &&
    typeof record.navigationAddress === 'string' && Number.isInteger(record.totalSpaces) && Number(record.totalSpaces) > 0 &&
    Number.isInteger(record.availableSpaces) && Number(record.availableSpaces) >= 0 &&
    Number(record.availableSpaces) <= Number(record.totalSpaces) &&
    isFeeType(record.feeType) && typeof record.feeStandard === 'string' &&
    isOpenStatus(record.openStatus) && typeof record.enabled === 'boolean' &&
    Number.isInteger(record.recommendationWeight) && Number(record.recommendationWeight) >= 0 &&
    Number(record.recommendationWeight) <= 100 &&
    Number.isInteger(record.sortOrder) && Number(record.sortOrder) >= 0 && typeof record.remark === 'string' &&
    record.coordinateSystem === 'GCJ-02' && typeof record.availabilityUpdatedAt === 'string' &&
    typeof record.createdAt === 'string' && typeof record.updatedAt === 'string'
}

function isParkingLot(value: unknown): value is ParkingLot {
  return isLegacyV3ParkingLot(value) &&
    isAvailabilityUpdateMethod((value as Record<string, unknown>).availabilityUpdateMethod)
}

function isV2ParkingLot(value: unknown): value is LegacyV2ParkingLot {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const point = record.point
  return typeof record.id === 'string' && typeof record.code === 'string' && typeof record.name === 'string' &&
    typeof record.locationDescription === 'string' &&
    (point === null || (typeof point === 'object' && isValidGeoPoint(point as { lng: number, lat: number }))) &&
    typeof record.navigationAddress === 'string' && Number.isInteger(record.totalSpaces) && Number(record.totalSpaces) > 0 &&
    Number.isInteger(record.availableSpaces) && Number(record.availableSpaces) >= 0 &&
    Number(record.availableSpaces) <= Number(record.totalSpaces) && isFeeType(record.feeType) &&
    (record.hourlyRateYuan === null || typeof record.hourlyRateYuan === 'number') &&
    isOpenStatus(record.openStatus) && typeof record.enabled === 'boolean' &&
    Number.isInteger(record.recommendationWeight) && Number(record.recommendationWeight) >= 0 &&
    Number(record.recommendationWeight) <= 100 && Number.isInteger(record.sortOrder) && Number(record.sortOrder) >= 0 &&
    typeof record.remark === 'string' && record.coordinateSystem === 'GCJ-02' &&
    typeof record.availabilityUpdatedAt === 'string' && typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
}

export class LocalParkingLotService implements ParkingLotService {
  private readonly injectedStorage: Storage | undefined
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalParkingLotServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveBrowserStorage()
  }

  private parseCurrent(raw: string): ParkingLot[] {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredParkingLots>
      if (
        parsed.schemaVersion !== PARKING_LOT_SCHEMA_VERSION ||
        !Array.isArray(parsed.records) ||
        !parsed.records.every(isParkingLot)
      ) throw new Error('Unsupported or invalid parking schema')
      return parsed.records.map(cloneParkingLot)
    }
    catch (error) {
      throw new ParkingLotServiceError('storage_corrupted', '本地停车场数据无法解析', { cause: error })
    }
  }

  private migrateV2(raw: string): ParkingLot[] {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredV2ParkingLots>
      if (parsed.schemaVersion !== 2 || !Array.isArray(parsed.records) || !parsed.records.every(isV2ParkingLot)) {
        throw new Error('Invalid v2 parking schema')
      }
      return parsed.records.map(({ hourlyRateYuan, ...record }): ParkingLot => ({
        ...record,
        point: clonePoint(record.point),
        availabilityUpdateMethod: 'manual',
        feeStandard: record.feeType === 'paid' && hourlyRateYuan !== null
          ? `${hourlyRateYuan.toLocaleString('zh-CN')} 元/小时`
          : '',
      }))
    }
    catch (error) {
      throw new ParkingLotServiceError('storage_corrupted', '旧版本地停车场数据无法解析', { cause: error })
    }
  }

  private migrateV3(raw: string): ParkingLot[] {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredV3ParkingLots>
      if (parsed.schemaVersion !== 3 || !Array.isArray(parsed.records) || !parsed.records.every(isLegacyV3ParkingLot)) {
        throw new Error('Invalid v3 parking schema')
      }
      return parsed.records.map((record): ParkingLot => ({
        ...record,
        point: clonePoint(record.point),
        availabilityUpdateMethod: 'manual',
      }))
    }
    catch (error) {
      throw new ParkingLotServiceError('storage_corrupted', '旧版本地停车场数据无法解析', { cause: error })
    }
  }

  private migrateLegacy(raw: string): ParkingLot[] {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredLegacyParkingLots>
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records) || !parsed.records.every(isLegacyParkingLot)) {
        throw new Error('Invalid legacy parking schema')
      }
      return parsed.records.map((record, index): ParkingLot => {
        const totalSpaces = Math.max(1, record.totalSpaces)
        return {
          id: record.id,
          code: codeIdentity(record.code),
          name: normalizeText(record.name),
          locationDescription: '',
          point: null,
          navigationAddress: normalizeText(record.address),
          totalSpaces,
          availableSpaces: totalSpaces,
          availabilityUpdateMethod: 'manual',
          feeType: 'free',
          feeStandard: '',
          openStatus: 'open',
          enabled: record.enabled,
          recommendationWeight: 50,
          sortOrder: index + 1,
          remark: normalizeText(record.remark),
          coordinateSystem: 'GCJ-02',
          availabilityUpdatedAt: record.updatedAt,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        }
      })
    }
    catch (error) {
      throw new ParkingLotServiceError('storage_corrupted', '旧版本地停车场数据无法解析', { cause: error })
    }
  }

  private read(): ParkingLot[] {
    const currentRaw = this.storage.getItem(PARKING_LOT_STORAGE_KEY)
    if (currentRaw !== null) return this.parseCurrent(currentRaw)
    const v3Raw = this.storage.getItem(LEGACY_V3_PARKING_LOT_STORAGE_KEY)
    if (v3Raw !== null) {
      const migrated = this.migrateV3(v3Raw)
      this.write(migrated)
      return migrated
    }
    const v2Raw = this.storage.getItem(LEGACY_V2_PARKING_LOT_STORAGE_KEY)
    if (v2Raw !== null) {
      const migrated = this.migrateV2(v2Raw)
      this.write(migrated)
      return migrated
    }
    const legacyRaw = this.storage.getItem(LEGACY_PARKING_LOT_STORAGE_KEY)
    if (legacyRaw === null) return []
    const migrated = this.migrateLegacy(legacyRaw)
    this.write(migrated)
    return migrated
  }

  private write(records: readonly ParkingLot[]): void {
    this.storage.setItem(PARKING_LOT_STORAGE_KEY, JSON.stringify({
      schemaVersion: PARKING_LOT_SCHEMA_VERSION,
      records: records.map(cloneParkingLot),
    } satisfies StoredParkingLots))
  }

  async list(): Promise<ParkingLot[]> {
    return sortParkingLots(this.read())
  }

  async create(input: ParkingLotCreateInput): Promise<ParkingLot> {
    const records = this.read()
    const validation = validateParkingLotCreateInput(input, records)
    if (!validation.valid) throwForValidation(validation.issues)
    const timestamp = this.now().toISOString()
    const sanitized = sanitizeParkingLotCreateInput(input)
    const record: ParkingLot = {
      ...sanitized,
      id: this.createId(),
      availableSpaces: sanitized.totalSpaces,
      coordinateSystem: 'GCJ-02',
      availabilityUpdatedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.write([...records, record])
    return cloneParkingLot(record)
  }

  async update(
    id: string,
    input: ParkingLotUpdateInput,
    options: ParkingLotUpdateOptions = {},
  ): Promise<ParkingLot> {
    const records = this.read()
    const index = records.findIndex((record) => record.id === id)
    if (index < 0) throw new ParkingLotServiceError('not_found', '未找到要更新的停车场')
    const validation = validateParkingLotBaseInput(input)
    if (!validation.valid) throwForValidation(validation.issues)
    const previous = records[index]!
    const sanitized = sanitizeParkingLotBaseInput(input)
    if (sanitized.totalSpaces < previous.availableSpaces && !options.clampAvailableSpaces) {
      throw new ParkingLotServiceError(
        'available_exceeds_total',
        '新的总车位数小于当前空余车位，请确认是否同步下调空余车位',
      )
    }
    const timestamp = this.now().toISOString()
    const shouldClamp = sanitized.totalSpaces < previous.availableSpaces
    const record: ParkingLot = {
      ...previous,
      ...sanitized,
      code: previous.code,
      availableSpaces: shouldClamp ? sanitized.totalSpaces : previous.availableSpaces,
      availabilityUpdatedAt: shouldClamp ? timestamp : previous.availabilityUpdatedAt,
      updatedAt: timestamp,
    }
    records[index] = record
    this.write(records)
    return cloneParkingLot(record)
  }

  async updateAvailability(id: string, availableSpaces: number): Promise<ParkingLot> {
    const records = this.read()
    const index = records.findIndex((record) => record.id === id)
    if (index < 0) throw new ParkingLotServiceError('not_found', '未找到要更新余位的停车场')
    const previous = records[index]!
    if (!Number.isInteger(availableSpaces) || availableSpaces < 0 || availableSpaces > previous.totalSpaces) {
      throw new ParkingLotServiceError(
        'invalid_available_spaces',
        `空余车位必须是 0–${previous.totalSpaces} 的整数`,
      )
    }
    const timestamp = this.now().toISOString()
    const record = { ...previous, availableSpaces, availabilityUpdatedAt: timestamp, updatedAt: timestamp }
    records[index] = record
    this.write(records)
    return cloneParkingLot(record)
  }

  async remove(id: string): Promise<void> {
    const records = this.read()
    if (!records.some((record) => record.id === id)) {
      throw new ParkingLotServiceError('not_found', '未找到要删除的停车场')
    }
    this.write(records.filter((record) => record.id !== id))
  }
}

export const parkingLotService: ParkingLotService = new LocalParkingLotService()
