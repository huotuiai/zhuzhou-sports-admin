import type {
  ContactNumber,
  ContactNumberValidationField,
  ContactNumberWriteInput,
  FeedbackHandleInput,
  FeedbackHandleValidationField,
  UserFeedback,
  UserServiceActor,
  UserServiceAuditAction,
  UserServiceAuditLog,
  UserServiceService,
  UserServiceSnapshot,
  ValidationIssue,
} from '../types'
import { createClientId } from '@/lib/id'

export const USER_SERVICE_STORAGE_KEY = 'zz-sports-user-services:v1'
export const USER_SERVICE_SCHEMA_VERSION = 1
const MAX_AUDIT_LOGS = 200

interface StoredUserServices {
  schemaVersion: typeof USER_SERVICE_SCHEMA_VERSION
  snapshot: UserServiceSnapshot
}

export type UserServiceErrorCode = 'storage_corrupted' | 'not_found' | 'invalid_input'

export class UserServiceError extends Error {
  readonly code: UserServiceErrorCode

  constructor(
    code: UserServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'UserServiceError'
    this.code = code
  }
}

export interface LocalUserServiceOptions {
  storage?: Storage
  createId?: () => string
  now?: () => Date
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC')
}

function normalizePhone(value: string): string {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function cloneFeedback(item: UserFeedback): UserFeedback {
  return { ...item }
}

function cloneContact(item: ContactNumber): ContactNumber {
  return { ...item }
}

function cloneAudit(item: UserServiceAuditLog): UserServiceAuditLog {
  return { ...item }
}

function cloneSnapshot(snapshot: UserServiceSnapshot): UserServiceSnapshot {
  return {
    feedbacks: snapshot.feedbacks.map(cloneFeedback),
    contacts: snapshot.contacts.map(cloneContact),
    auditLogs: snapshot.auditLogs.map(cloneAudit),
  }
}

function sortSnapshot(snapshot: UserServiceSnapshot): UserServiceSnapshot {
  return {
    feedbacks: [...snapshot.feedbacks]
      .sort((first, second) => second.submittedAt.localeCompare(first.submittedAt))
      .map(cloneFeedback),
    contacts: [...snapshot.contacts]
      .sort((first, second) => first.sort - second.sort || first.createdAt.localeCompare(second.createdAt))
      .map(cloneContact),
    auditLogs: [...snapshot.auditLogs]
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
      .map(cloneAudit),
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isFeedback(value: unknown): value is UserFeedback {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.code === 'string' &&
    ['error', 'suggestion', 'complaint', 'other'].includes(String(item.type)) &&
    typeof item.content === 'string' && isNullableString(item.contact) &&
    typeof item.submittedAt === 'string' && ['pending', 'processed'].includes(String(item.status)) &&
    isNullableString(item.handlerId) && isNullableString(item.handlerName) &&
    isNullableString(item.handledAt) && typeof item.handlingRemark === 'string'
}

function isContact(value: unknown): value is ContactNumber {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.phone === 'string' &&
    typeof item.sort === 'number' && Number.isInteger(item.sort) && item.sort > 0 &&
    typeof item.displayEnabled === 'boolean' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
}

function isAudit(value: unknown): value is UserServiceAuditLog {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const actions: UserServiceAuditAction[] = [
    'handle-feedback', 'update-feedback-remark', 'create-contact', 'update-contact', 'delete-contact',
  ]
  return typeof item.id === 'string' && actions.includes(item.action as UserServiceAuditAction) &&
    ['feedback', 'contact'].includes(String(item.entityType)) && typeof item.entityId === 'string' &&
    typeof item.entityLabel === 'string' && typeof item.operatorId === 'string' &&
    typeof item.operatorName === 'string' && typeof item.summary === 'string' && typeof item.createdAt === 'string'
}

function isSnapshot(value: unknown): value is UserServiceSnapshot {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return Array.isArray(item.feedbacks) && item.feedbacks.every(isFeedback) &&
    Array.isArray(item.contacts) && item.contacts.every(isContact) &&
    Array.isArray(item.auditLogs) && item.auditLogs.every(isAudit)
}

export function createDefaultUserServiceSnapshot(): UserServiceSnapshot {
  return {
    feedbacks: [
      {
        id: 'feedback-fk-001',
        code: 'FK-001',
        type: 'suggestion',
        content: '建议在停车页增加目的地停车场剩余车位趋势图，方便用户出行前判断停车场繁忙程度，减少到场后排队等待。',
        contact: '138****0000',
        submittedAt: '2026-08-13T01:20:00.000Z',
        status: 'pending',
        handlerId: null,
        handlerName: null,
        handledAt: null,
        handlingRemark: '',
      },
      {
        id: 'feedback-fk-002',
        code: 'FK-002',
        type: 'error',
        content: '座位图页 3D 模型加载较慢，弱网环境下出现白屏，建议增加骨架屏与资源预加载策略，并优化模型压缩体积。',
        contact: null,
        submittedAt: '2026-08-13T00:45:00.000Z',
        status: 'pending',
        handlerId: null,
        handlerName: null,
        handledAt: null,
        handlingRemark: '',
      },
      {
        id: 'feedback-fk-003',
        code: 'FK-003',
        type: 'complaint',
        content: '8.12 活动日 P3 停车场满位信息更新不及时，用户到场发现满位，现场体验较差。希望活动日提高停车场数据同步频率。',
        contact: '139****5678',
        submittedAt: '2026-08-12T13:10:00.000Z',
        status: 'pending',
        handlerId: null,
        handlerName: null,
        handledAt: null,
        handlingRemark: '',
      },
      {
        id: 'feedback-fk-004',
        code: 'FK-004',
        type: 'suggestion',
        content: '建议接驳页增加发车时间提醒功能，提前 10 分钟提醒用户前往乘车点，减少错过班次的情况。',
        contact: null,
        submittedAt: '2026-08-11T08:30:00.000Z',
        status: 'processed',
        handlerId: 'user-admin',
        handlerName: '管理员',
        handledAt: '2026-08-11T09:10:00.000Z',
        handlingRemark: '已转接驳运营确认：将在下一版本加入提醒，预计 9 月初上线。',
      },
    ],
    contacts: [
      {
        id: 'contact-service-hotline',
        name: '服务热线',
        phone: '0731-2228 6666',
        sort: 1,
        displayEnabled: true,
        createdAt: '2026-08-01T01:00:00.000Z',
        updatedAt: '2026-08-01T01:00:00.000Z',
      },
      {
        id: 'contact-emergency',
        name: '紧急求助',
        phone: '0731-2228 9110',
        sort: 2,
        displayEnabled: true,
        createdAt: '2026-08-01T01:05:00.000Z',
        updatedAt: '2026-08-01T01:05:00.000Z',
      },
    ],
    auditLogs: [],
  }
}

export function sanitizeContactNumberInput(input: ContactNumberWriteInput): ContactNumberWriteInput {
  return {
    name: normalizeText(input.name),
    phone: normalizePhone(input.phone),
    sort: Number(input.sort),
    displayEnabled: Boolean(input.displayEnabled),
  }
}

export function validateContactNumberInput(
  input: ContactNumberWriteInput,
): ValidationIssue<ContactNumberValidationField>[] {
  const value = sanitizeContactNumberInput(input)
  const issues: ValidationIssue<ContactNumberValidationField>[] = []
  if (!value.name) issues.push({ field: 'name', code: 'required', message: '请输入号码名称' })
  if (!value.phone) issues.push({ field: 'phone', code: 'required', message: '请输入联系电话' })
  else if (!/^(?:1\d{10}|0\d{2,3}-?\d{7,8})$/.test(value.phone.replace(/\s/g, ''))) {
    issues.push({ field: 'phone', code: 'invalid', message: '请输入正确的手机号或固定电话' })
  }
  if (!Number.isInteger(value.sort) || value.sort <= 0) {
    issues.push({ field: 'sort', code: 'positive_integer', message: '排序必须是大于 0 的整数' })
  }
  return issues
}

export function validateFeedbackHandleInput(
  input: FeedbackHandleInput,
): ValidationIssue<FeedbackHandleValidationField>[] {
  const issues: ValidationIssue<FeedbackHandleValidationField>[] = []
  if (!normalizeText(input.remark)) issues.push({ field: 'remark', code: 'required', message: '请填写处理备注' })
  return issues
}

function validateActor(actor: UserServiceActor): void {
  if (!normalizeText(actor.id) || !normalizeText(actor.name)) {
    throw new UserServiceError('invalid_input', '当前操作人信息无效')
  }
}

function resolveStorage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new UserServiceError('storage_corrupted', '当前环境不支持本地存储')
  }
  return globalThis.localStorage
}

export class LocalUserService implements UserServiceService {
  private readonly injectedStorage?: Storage
  private readonly createId: () => string
  private readonly now: () => Date

  constructor(options: LocalUserServiceOptions = {}) {
    this.injectedStorage = options.storage
    this.createId = options.createId ?? createClientId
    this.now = options.now ?? (() => new Date())
  }

  private get storage(): Storage {
    return this.injectedStorage ?? resolveStorage()
  }

  private read(): UserServiceSnapshot {
    const raw = this.storage.getItem(USER_SERVICE_STORAGE_KEY)
    if (!raw) {
      const snapshot = sortSnapshot(createDefaultUserServiceSnapshot())
      this.write(snapshot)
      return snapshot
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredUserServices>
      if (parsed.schemaVersion !== USER_SERVICE_SCHEMA_VERSION || !isSnapshot(parsed.snapshot)) {
        throw new Error('Invalid user service data')
      }
      return sortSnapshot(parsed.snapshot)
    } catch (error) {
      throw new UserServiceError('storage_corrupted', '本地用户服务数据无法解析', { cause: error })
    }
  }

  private write(snapshot: UserServiceSnapshot): void {
    const envelope: StoredUserServices = {
      schemaVersion: USER_SERVICE_SCHEMA_VERSION,
      snapshot: cloneSnapshot(snapshot),
    }
    this.storage.setItem(USER_SERVICE_STORAGE_KEY, JSON.stringify(envelope))
  }

  private audit(
    snapshot: UserServiceSnapshot,
    action: UserServiceAuditAction,
    entityType: UserServiceAuditLog['entityType'],
    entityId: string,
    entityLabel: string,
    actor: UserServiceActor,
    summary: string,
    timestamp: string,
  ): void {
    snapshot.auditLogs.push({
      id: this.createId(),
      action,
      entityType,
      entityId,
      entityLabel,
      operatorId: normalizeText(actor.id),
      operatorName: normalizeText(actor.name),
      summary,
      createdAt: timestamp,
    })
    if (snapshot.auditLogs.length > MAX_AUDIT_LOGS) {
      snapshot.auditLogs.splice(0, snapshot.auditLogs.length - MAX_AUDIT_LOGS)
    }
  }

  async load(): Promise<UserServiceSnapshot> {
    return cloneSnapshot(this.read())
  }

  async handleFeedback(id: string, input: FeedbackHandleInput): Promise<UserFeedback> {
    validateActor(input.actor)
    const issues = validateFeedbackHandleInput(input)
    if (issues.length) throw new UserServiceError('invalid_input', issues[0]!.message)
    const snapshot = this.read()
    const feedback = snapshot.feedbacks.find((item) => item.id === id)
    if (!feedback) throw new UserServiceError('not_found', '未找到要处理的反馈')

    const timestamp = this.now().toISOString()
    const wasProcessed = feedback.status === 'processed'
    const nextStatus = wasProcessed || input.markProcessed ? 'processed' : 'pending'
    feedback.handlingRemark = normalizeText(input.remark)
    feedback.status = nextStatus
    if (nextStatus === 'processed') {
      feedback.handlerId = normalizeText(input.actor.id)
      feedback.handlerName = normalizeText(input.actor.name)
      feedback.handledAt = timestamp
    }
    this.audit(
      snapshot,
      wasProcessed ? 'update-feedback-remark' : 'handle-feedback',
      'feedback',
      feedback.id,
      feedback.code,
      input.actor,
      nextStatus === 'processed' ? '保存处理备注并标记为已处理' : '保存处理备注，保留未处理状态',
      timestamp,
    )
    this.write(snapshot)
    return cloneFeedback(feedback)
  }

  async createContact(input: ContactNumberWriteInput, actor: UserServiceActor): Promise<ContactNumber> {
    validateActor(actor)
    const issues = validateContactNumberInput(input)
    if (issues.length) throw new UserServiceError('invalid_input', issues[0]!.message)
    const snapshot = this.read()
    const value = sanitizeContactNumberInput(input)
    const timestamp = this.now().toISOString()
    const contact: ContactNumber = {
      ...value,
      id: this.createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    snapshot.contacts.push(contact)
    this.audit(snapshot, 'create-contact', 'contact', contact.id, contact.name, actor, `新增联系电话 ${contact.phone}`, timestamp)
    this.write(snapshot)
    return cloneContact(contact)
  }

  async updateContact(
    id: string,
    input: ContactNumberWriteInput,
    actor: UserServiceActor,
  ): Promise<ContactNumber> {
    validateActor(actor)
    const issues = validateContactNumberInput(input)
    if (issues.length) throw new UserServiceError('invalid_input', issues[0]!.message)
    const snapshot = this.read()
    const index = snapshot.contacts.findIndex((item) => item.id === id)
    if (index < 0) throw new UserServiceError('not_found', '未找到要更新的联系电话')
    const previous = snapshot.contacts[index]!
    const value = sanitizeContactNumberInput(input)
    const timestamp = this.now().toISOString()
    const contact: ContactNumber = {
      ...value,
      id,
      createdAt: previous.createdAt,
      updatedAt: timestamp,
    }
    snapshot.contacts[index] = contact
    this.audit(snapshot, 'update-contact', 'contact', contact.id, contact.name, actor, `更新联系电话 ${contact.phone}`, timestamp)
    this.write(snapshot)
    return cloneContact(contact)
  }

  async removeContact(id: string, actor: UserServiceActor): Promise<void> {
    validateActor(actor)
    const snapshot = this.read()
    const contact = snapshot.contacts.find((item) => item.id === id)
    if (!contact) throw new UserServiceError('not_found', '未找到要删除的联系电话')
    snapshot.contacts = snapshot.contacts.filter((item) => item.id !== id)
    const timestamp = this.now().toISOString()
    this.audit(snapshot, 'delete-contact', 'contact', contact.id, contact.name, actor, `删除联系电话 ${contact.phone}`, timestamp)
    this.write(snapshot)
  }

  async listAuditLogs(): Promise<UserServiceAuditLog[]> {
    return this.read().auditLogs.map(cloneAudit)
  }
}

// 后端接口就绪后，实现 UserServiceService 并在此替换实例即可。
export const userServiceService: UserServiceService = new LocalUserService()
