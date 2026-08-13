import { cloneGeometry, validateGeometry } from '../lib/geometry'
import type { ControlZone, ControlZoneService, ControlZoneWriteInput } from '../types'
import { createClientId } from '@/lib/id'

export const CONTROL_ZONE_STORAGE_KEY = 'zz-sports-control-zones:v1'
export const CONTROL_ZONE_SCHEMA_VERSION = 1

interface StoredControlZones {
  schemaVersion: typeof CONTROL_ZONE_SCHEMA_VERSION
  records: ControlZone[]
}

export type ControlZoneServiceErrorCode =
  | 'invalid_name'
  | 'duplicate_name'
  | 'description_too_long'
  | 'invalid_geometry'
  | 'not_found'
  | 'storage_unavailable'
  | 'storage_corrupted'

export class ControlZoneServiceError extends Error {
  readonly code: ControlZoneServiceErrorCode

  constructor(code: ControlZoneServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ControlZoneServiceError'
    this.code = code
  }
}

export interface LocalControlZoneServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

function resolveBrowserStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new ControlZoneServiceError('storage_unavailable', '当前环境不支持本地存储')
  }
  return globalThis.localStorage
}

function defaultCreateId(): string {
  return createClientId()
}

export function normalizeControlZoneName(name: string): string {
  return name.trim().normalize('NFKC')
}

export function controlZoneNameIdentity(name: string): string {
  return normalizeControlZoneName(name).toLocaleLowerCase('zh-CN')
}

function sanitizeInput(input: ControlZoneWriteInput): ControlZoneWriteInput {
  const name = normalizeControlZoneName(input.name)
  if (!name) {
    throw new ControlZoneServiceError('invalid_name', '管制区域名称不能为空')
  }
  if (Array.from(input.description).length > 300) {
    throw new ControlZoneServiceError('description_too_long', '说明不能超过 300 个字符')
  }
  const geometry = cloneGeometry(input.geometry)
  const geometryValidation = validateGeometry(geometry)
  if (!geometryValidation.valid) {
    throw new ControlZoneServiceError(
      'invalid_geometry',
      geometryValidation.reason ?? '管制区域几何数据无效',
    )
  }
  if (!Number.isFinite(input.areaSquareMeters) || input.areaSquareMeters <= 0) {
    throw new ControlZoneServiceError('invalid_geometry', '管制区域面积必须大于零')
  }

  return {
    name,
    description: input.description,
    enabled: input.enabled,
    coordinateSystem: 'GCJ-02',
    geometry,
    areaSquareMeters: input.areaSquareMeters,
  }
}

function cloneControlZone(record: ControlZone): ControlZone {
  return { ...record, geometry: cloneGeometry(record.geometry) }
}

function sortByUpdatedAt(records: readonly ControlZone[]): ControlZone[] {
  return [...records]
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .map(cloneControlZone)
}

function isLngLat(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  )
}

function isControlZone(value: unknown): value is ControlZone {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const geometry = record.geometry
  if (!geometry || typeof geometry !== 'object') return false
  const geometryRecord = geometry as Record<string, unknown>
  const validGeometry =
    (geometryRecord.type === 'rectangle' &&
      isLngLat(geometryRecord.southWest) &&
      isLngLat(geometryRecord.northEast)) ||
    (geometryRecord.type === 'polygon' &&
      Array.isArray(geometryRecord.path) &&
      geometryRecord.path.every(isLngLat))

  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.description === 'string' &&
    typeof record.enabled === 'boolean' &&
    record.coordinateSystem === 'GCJ-02' &&
    typeof record.areaSquareMeters === 'number' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    validGeometry
  )
}

export class LocalControlZoneService implements ControlZoneService {
  private readonly injectedStorage: Storage | undefined
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalControlZoneServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? defaultCreateId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveBrowserStorage()
  }

  private read(): ControlZone[] {
    const raw = this.storage.getItem(CONTROL_ZONE_STORAGE_KEY)
    if (!raw) return []

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid storage envelope')
      const envelope = parsed as Record<string, unknown>
      if (
        envelope.schemaVersion !== CONTROL_ZONE_SCHEMA_VERSION ||
        !Array.isArray(envelope.records) ||
        !envelope.records.every(isControlZone)
      ) {
        throw new Error('Unsupported or invalid storage schema')
      }
      return envelope.records.map(cloneControlZone)
    } catch (error) {
      throw new ControlZoneServiceError('storage_corrupted', '本地管制区域数据无法解析', {
        cause: error,
      })
    }
  }

  private write(records: readonly ControlZone[]): void {
    const envelope: StoredControlZones = {
      schemaVersion: CONTROL_ZONE_SCHEMA_VERSION,
      records: records.map(cloneControlZone),
    }
    this.storage.setItem(CONTROL_ZONE_STORAGE_KEY, JSON.stringify(envelope))
  }

  private assertUniqueName(records: readonly ControlZone[], name: string, excludedId?: string): void {
    const identity = controlZoneNameIdentity(name)
    const duplicate = records.some(
      (record) => record.id !== excludedId && controlZoneNameIdentity(record.name) === identity,
    )
    if (duplicate) {
      throw new ControlZoneServiceError('duplicate_name', '管制区域名称不能重复')
    }
  }

  async list(): Promise<ControlZone[]> {
    return sortByUpdatedAt(this.read())
  }

  async create(input: ControlZoneWriteInput): Promise<ControlZone> {
    const records = this.read()
    const sanitized = sanitizeInput(input)
    this.assertUniqueName(records, sanitized.name)
    const timestamp = this.now().toISOString()
    const record: ControlZone = {
      ...sanitized,
      id: this.createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.write([...records, record])
    return cloneControlZone(record)
  }

  async update(id: string, input: ControlZoneWriteInput): Promise<ControlZone> {
    const records = this.read()
    const index = records.findIndex((record) => record.id === id)
    if (index < 0) throw new ControlZoneServiceError('not_found', '未找到要更新的管制区域')

    const sanitized = sanitizeInput(input)
    this.assertUniqueName(records, sanitized.name, id)
    const previous = records[index]!
    const record: ControlZone = {
      ...sanitized,
      id,
      createdAt: previous.createdAt,
      updatedAt: this.now().toISOString(),
    }
    const nextRecords = [...records]
    nextRecords[index] = record
    this.write(nextRecords)
    return cloneControlZone(record)
  }

  async remove(id: string): Promise<void> {
    const records = this.read()
    const nextRecords = records.filter((record) => record.id !== id)
    if (nextRecords.length === records.length) {
      throw new ControlZoneServiceError('not_found', '未找到要删除的管制区域')
    }
    this.write(nextRecords)
  }
}

export function createLocalControlZoneService(options: LocalControlZoneServiceOptions = {}): ControlZoneService {
  return new LocalControlZoneService(options)
}

export const controlZoneService = createLocalControlZoneService()
