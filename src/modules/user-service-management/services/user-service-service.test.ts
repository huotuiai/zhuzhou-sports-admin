import type { ContactNumberWriteInput, FeedbackHandleInput, UserServiceActor } from '../types'
import { describe, expect, it } from 'vitest'
import {
  LocalUserService,
  USER_SERVICE_SCHEMA_VERSION,
  USER_SERVICE_STORAGE_KEY,
  validateContactNumberInput,
  validateFeedbackHandleInput,
} from './user-service-service'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

const actor: UserServiceActor = { id: 'user-admin', name: '管理员' }

function contactInput(overrides: Partial<ContactNumberWriteInput> = {}): ContactNumberWriteInput {
  return { name: '场馆总机', phone: '0731-22286666', sort: 3, displayEnabled: true, ...overrides }
}

function feedbackInput(overrides: Partial<FeedbackHandleInput> = {}): FeedbackHandleInput {
  return { remark: '已完成电话回访并记录处理结果。', markProcessed: true, actor, ...overrides }
}

describe('LocalUserService', () => {
  it('seeds and persists the prototype snapshot with a schema version', async () => {
    const storage = new MemoryStorage()
    const service = new LocalUserService({ storage })

    const snapshot = await service.load()
    expect(snapshot.feedbacks).toHaveLength(4)
    expect(snapshot.contacts.map((item) => item.name)).toEqual(['服务热线', '紧急求助'])
    expect(snapshot.feedbacks.map((item) => item.code)).toEqual(['FK-001', 'FK-002', 'FK-003', 'FK-004'])

    const stored = JSON.parse(storage.getItem(USER_SERVICE_STORAGE_KEY) ?? '{}') as { schemaVersion?: number }
    expect(stored.schemaVersion).toBe(USER_SERVICE_SCHEMA_VERSION)
    expect(await new LocalUserService({ storage }).load()).toEqual(snapshot)
  })

  it('handles pending feedback, records the actor, and never reopens processed feedback', async () => {
    const storage = new MemoryStorage()
    const timestamps = [
      new Date('2026-08-17T02:00:00.000Z'),
      new Date('2026-08-17T03:00:00.000Z'),
    ]
    let timeIndex = 0
    let idIndex = 0
    const service = new LocalUserService({
      storage,
      now: () => timestamps[timeIndex++]!,
      createId: () => `audit-${++idIndex}`,
    })
    const pending = (await service.load()).feedbacks.find((item) => item.code === 'FK-001')!

    const processed = await service.handleFeedback(pending.id, feedbackInput())
    expect(processed).toMatchObject({
      status: 'processed',
      handlerId: actor.id,
      handlerName: actor.name,
      handledAt: timestamps[0]!.toISOString(),
    })

    const updated = await service.handleFeedback(pending.id, feedbackInput({ remark: '补充回访结果', markProcessed: false }))
    expect(updated.status).toBe('processed')
    expect(updated.handlingRemark).toBe('补充回访结果')
    expect((await service.listAuditLogs()).map((item) => item.action)).toEqual([
      'update-feedback-remark',
      'handle-feedback',
    ])
  })

  it('allows saving a remark while a pending feedback remains pending', async () => {
    const service = new LocalUserService({ storage: new MemoryStorage(), createId: () => 'audit-1' })
    const pending = (await service.load()).feedbacks.find((item) => item.code === 'FK-002')!
    const updated = await service.handleFeedback(pending.id, feedbackInput({ markProcessed: false }))

    expect(updated).toMatchObject({ status: 'pending', handlerId: null, handledAt: null })
    expect(updated.handlingRemark).toBe(feedbackInput().remark)
  })

  it('persists contact CRUD in sort order and writes audit records', async () => {
    const storage = new MemoryStorage()
    let idIndex = 0
    let timeIndex = 0
    const timestamps = [
      new Date('2026-08-17T01:00:00.000Z'),
      new Date('2026-08-17T02:00:00.000Z'),
      new Date('2026-08-17T03:00:00.000Z'),
    ]
    const service = new LocalUserService({
      storage,
      now: () => timestamps[timeIndex++]!,
      createId: () => `generated-${++idIndex}`,
    })
    await service.load()

    const created = await service.createContact(contactInput({ sort: 1, phone: ' 0731-2228 7777 ' }), actor)
    expect(created.phone).toBe('0731-2228 7777')
    expect((await service.load()).contacts[1]?.id).toBe(created.id)

    const updated = await service.updateContact(created.id, contactInput({ name: '咨询热线', sort: 4 }), actor)
    expect(updated).toMatchObject({ name: '咨询热线', sort: 4, createdAt: created.createdAt })

    await service.removeContact(created.id, actor)
    expect((await service.load()).contacts.some((item) => item.id === created.id)).toBe(false)
    expect((await service.listAuditLogs()).map((item) => item.action)).toEqual([
      'delete-contact',
      'update-contact',
      'create-contact',
    ])
  })

  it('validates required remarks, phone formats, and positive sort values', () => {
    expect(validateFeedbackHandleInput(feedbackInput({ remark: '  ' }))).toEqual([
      { field: 'remark', code: 'required', message: '请填写处理备注' },
    ])
    expect(validateContactNumberInput(contactInput({ name: '', phone: '12345', sort: 0 }))).toEqual([
      { field: 'name', code: 'required', message: '请输入号码名称' },
      { field: 'phone', code: 'invalid', message: '请输入正确的手机号或固定电话' },
      { field: 'sort', code: 'positive_integer', message: '排序必须是大于 0 的整数' },
    ])
    expect(validateContactNumberInput(contactInput({ phone: '13800138000' }))).toEqual([])
  })

  it('reports corrupted storage and missing records', async () => {
    const storage = new MemoryStorage()
    storage.setItem(USER_SERVICE_STORAGE_KEY, '{invalid')
    const service = new LocalUserService({ storage })
    await expect(service.load()).rejects.toMatchObject({ code: 'storage_corrupted' })

    storage.clear()
    await service.load()
    await expect(service.handleFeedback('missing', feedbackInput())).rejects.toMatchObject({ code: 'not_found' })
    await expect(service.updateContact('missing', contactInput(), actor)).rejects.toMatchObject({ code: 'not_found' })
    await expect(service.removeContact('missing', actor)).rejects.toMatchObject({ code: 'not_found' })
  })
})
