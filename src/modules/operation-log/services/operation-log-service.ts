import type {
  OperationLog,
  OperationLogAction,
  OperationLogModule,
  OperationLogResult,
  OperationLogService,
} from '../types'

export const OPERATION_LOG_STORAGE_KEY = 'zz-sports-operation-logs:v1'
export const OPERATION_LOG_SCHEMA_VERSION = 1

interface StoredOperationLogs {
  schemaVersion: typeof OPERATION_LOG_SCHEMA_VERSION
  logs: OperationLog[]
}

export type OperationLogServiceErrorCode = 'storage_unavailable' | 'storage_corrupted'

export class OperationLogServiceError extends Error {
  readonly code: OperationLogServiceErrorCode

  constructor(
    code: OperationLogServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'OperationLogServiceError'
    this.code = code
  }
}

export interface LocalOperationLogServiceOptions {
  storage?: Storage
}

const MODULES: readonly OperationLogModule[] = [
  'user-management',
  'role-management',
  'content-management',
  'traffic-control',
  'parking-management',
  'shuttle-management',
  'seat-management',
  'ticket-gate-management',
  'external-data',
  'user-service',
]

const ACTIONS: readonly OperationLogAction[] = [
  'create',
  'update',
  'delete',
  'publish',
  'revoke',
  'pin',
  'sync',
  'bind',
  'status-change',
  'login',
]

const RESULTS: readonly OperationLogResult[] = ['success', 'failure']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isJsonValue(value: unknown): boolean {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function isOperationLog(value: unknown): value is OperationLog {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.code === 'string' &&
    typeof value.operatorId === 'string' &&
    typeof value.operatorUsername === 'string' &&
    typeof value.operatorName === 'string' &&
    (value.departmentId === null || typeof value.departmentId === 'string') &&
    typeof value.departmentName === 'string' &&
    MODULES.includes(value.module as OperationLogModule) &&
    ACTIONS.includes(value.action as OperationLogAction) &&
    typeof value.targetType === 'string' &&
    typeof value.targetId === 'string' &&
    typeof value.targetLabel === 'string' &&
    typeof value.performedAt === 'string' &&
    !Number.isNaN(new Date(value.performedAt).getTime()) &&
    typeof value.ipAddress === 'string' &&
    RESULTS.includes(value.result as OperationLogResult) &&
    isRecord(value.details) &&
    isJsonValue(value.details)
}

function cloneLog(log: OperationLog): OperationLog {
  return JSON.parse(JSON.stringify(log)) as OperationLog
}

function cloneAndSort(logs: readonly OperationLog[]): OperationLog[] {
  return logs.map(cloneLog).sort((first, second) =>
    second.performedAt.localeCompare(first.performedAt) || second.code.localeCompare(first.code),
  )
}

function resolveStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new OperationLogServiceError('storage_unavailable', '当前环境不支持本地日志存储')
  }
  return globalThis.localStorage
}

export function createDefaultOperationLogs(): OperationLog[] {
  return cloneAndSort([
    {
      id: 'operation-log-001',
      code: 'LOG-001',
      operatorId: 'user-admin',
      operatorUsername: 'admin',
      operatorName: '管理员',
      departmentId: 'department-venue',
      departmentName: '体育中心管理方',
      module: 'content-management',
      action: 'pin',
      targetType: '内容',
      targetId: 'CT-001',
      targetLabel: '8.15 群星演唱会 · 出行指南',
      performedAt: '2026-08-13T02:02:00.000Z',
      ipAddress: '10.0.1.5',
      result: 'success',
      details: {
        action: 'toggle_pin',
        target_type: 'content',
        target_id: 'CT-001',
        changes: [{ field: 'is_pinned', from: false, to: true }],
        request_id: 'req_8f3a2b1c',
      },
    },
    {
      id: 'operation-log-002',
      code: 'LOG-002',
      operatorId: 'user-admin',
      operatorUsername: 'admin',
      operatorName: '管理员',
      departmentId: 'department-venue',
      departmentName: '体育中心管理方',
      module: 'user-management',
      action: 'login',
      targetType: '用户',
      targetId: 'admin',
      targetLabel: '管理员账号',
      performedAt: '2026-08-13T01:58:00.000Z',
      ipAddress: '10.0.1.5',
      result: 'success',
      details: {
        action: 'login',
        authentication: 'password_and_captcha',
        user_agent: 'Chrome 139 / macOS',
        request_id: 'req_a3610f27',
      },
    },
    {
      id: 'operation-log-003',
      code: 'LOG-003',
      operatorId: 'user-traffic-admin',
      operatorUsername: 'zhangjing',
      operatorName: '张警官',
      departmentId: 'department-police',
      departmentName: '交警大队',
      module: 'traffic-control',
      action: 'publish',
      targetType: '管制',
      targetId: 'GZ-002',
      targetLabel: '演出散场期间临时交通疏导',
      performedAt: '2026-08-13T01:45:00.000Z',
      ipAddress: '10.0.2.18',
      result: 'success',
      details: {
        action: 'publish',
        target_type: 'traffic_control',
        target_id: 'GZ-002',
        changes: [{ field: 'status', from: 'draft', to: 'published' }],
        request_id: 'req_3460db12',
      },
    },
    {
      id: 'operation-log-004',
      code: 'LOG-004',
      operatorId: 'user-venue-admin',
      operatorUsername: 'changwu',
      operatorName: '场馆管理员',
      departmentId: 'department-operations',
      departmentName: '场馆运营部',
      module: 'parking-management',
      action: 'status-change',
      targetType: '停车场',
      targetId: 'P5',
      targetLabel: '体育场东侧停车场',
      performedAt: '2026-08-13T01:30:00.000Z',
      ipAddress: '10.0.3.22',
      result: 'success',
      details: {
        action: 'update_status',
        target_type: 'parking_lot',
        target_id: 'P5',
        changes: [{ field: 'availability', from: 'available', to: 'full' }],
        request_id: 'req_329bb0a1',
      },
    },
    {
      id: 'operation-log-005',
      code: 'LOG-005',
      operatorId: 'user-tech-operator',
      operatorUsername: 'yunwei',
      operatorName: '运维工程师',
      departmentId: 'department-technology',
      departmentName: '技术运维部',
      module: 'external-data',
      action: 'sync',
      targetType: '对接源',
      targetId: 'SRC-03',
      targetLabel: '主办方活动数据源',
      performedAt: '2026-08-13T01:12:00.000Z',
      ipAddress: '10.0.4.9',
      result: 'failure',
      details: {
        action: 'synchronize',
        target_type: 'external_source',
        target_id: 'SRC-03',
        endpoint: '/integration/organizer/events',
        error: {
          code: 'UPSTREAM_TIMEOUT',
          message: '上游接口在 10 秒内未返回结果',
          retryable: true,
        },
        retry: { current: 3, maximum: 3 },
        request_id: 'req_4de90b1f',
      },
    },
    {
      id: 'operation-log-006',
      code: 'LOG-006',
      operatorId: 'user-venue-admin',
      operatorUsername: 'changwu',
      operatorName: '场馆管理员',
      departmentId: 'department-operations',
      departmentName: '场馆运营部',
      module: 'seat-management',
      action: 'create',
      targetType: '分区',
      targetId: 'C-03',
      targetLabel: '体育场 C 区三层',
      performedAt: '2026-08-12T10:40:00.000Z',
      ipAddress: '10.0.3.22',
      result: 'success',
      details: {
        action: 'create_zone',
        target_type: 'seat_zone',
        target_id: 'C-03',
        changes: [
          { field: 'floor', from: null, to: '三层' },
          { field: 'capacity', from: null, to: 680 },
        ],
        request_id: 'req_f8a9d443',
      },
    },
  ])
}

export class LocalOperationLogService implements OperationLogService {
  private readonly injectedStorage?: Storage

  constructor(options: LocalOperationLogServiceOptions = {}) {
    this.injectedStorage = options.storage
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveStorage()
  }

  private write(logs: readonly OperationLog[]): void {
    const envelope: StoredOperationLogs = {
      schemaVersion: OPERATION_LOG_SCHEMA_VERSION,
      logs: cloneAndSort(logs),
    }
    this.storage.setItem(OPERATION_LOG_STORAGE_KEY, JSON.stringify(envelope))
  }

  async load(): Promise<OperationLog[]> {
    const raw = this.storage.getItem(OPERATION_LOG_STORAGE_KEY)
    if (!raw) {
      const logs = createDefaultOperationLogs()
      this.write(logs)
      return cloneAndSort(logs)
    }

    try {
      const parsed = JSON.parse(raw) as Partial<StoredOperationLogs>
      if (parsed.schemaVersion !== OPERATION_LOG_SCHEMA_VERSION ||
        !Array.isArray(parsed.logs) ||
        !parsed.logs.every(isOperationLog)) {
        throw new Error('Invalid operation log storage schema')
      }
      return cloneAndSort(parsed.logs)
    } catch (error) {
      throw new OperationLogServiceError('storage_corrupted', '本地操作日志数据无法解析', { cause: error })
    }
  }
}

export const operationLogService = new LocalOperationLogService()
