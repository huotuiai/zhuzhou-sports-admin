import type { UserServiceSnapshot } from '../types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDefaultUserServiceSnapshot,
  LocalUserService,
  USER_SERVICE_SCHEMA_VERSION,
  USER_SERVICE_STORAGE_KEY,
} from '../services/user-service-service'
import { createUserServiceStore, toShanghaiDateKey, USER_SERVICE_PAGE_SIZE, validateFeedbackQuery } from './user-service-store'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('user service store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('filters by type, status, and inclusive Shanghai calendar dates', async () => {
    const service = new LocalUserService({ storage: new MemoryStorage() })
    const useStore = createUserServiceStore(service, 'user-service-filter-test')
    const store = useStore()
    expect(await store.load()).toBe(true)

    expect(store.setQuery({ type: 'suggestion', status: 'pending', startDate: '2026-08-13', endDate: '2026-08-13' })).toBe(true)
    expect(store.filteredFeedbacks.map((item) => item.code)).toEqual(['FK-001'])

    expect(store.setQuery({ type: 'all', status: 'all', startDate: '2026-08-11', endDate: '2026-08-12' })).toBe(true)
    expect(store.filteredFeedbacks.map((item) => item.code)).toEqual(['FK-003', 'FK-004'])

    store.resetQuery()
    expect(store.filteredFeedbacks).toHaveLength(4)
    expect(store.currentPage).toBe(1)
  })

  it('rejects reversed date ranges without replacing the applied query', async () => {
    const useStore = createUserServiceStore(new LocalUserService({ storage: new MemoryStorage() }), 'user-service-date-test')
    const store = useStore()
    await store.load()
    const previous = { ...store.query }

    expect(store.setQuery({ type: 'all', status: 'all', startDate: '2026-08-13', endDate: '2026-08-12' })).toBe(false)
    expect(store.queryError).toBe('开始日期不能晚于结束日期')
    expect(store.query).toEqual(previous)
    expect(validateFeedbackQuery({ type: 'all', status: 'all', startDate: '', endDate: '' })).toBeNull()
  })

  it('paginates feedback with a fixed page size of 20 and clamps the page', async () => {
    const storage = new MemoryStorage()
    const base = createDefaultUserServiceSnapshot()
    const feedback = base.feedbacks[0]!
    const snapshot: UserServiceSnapshot = {
      ...base,
      feedbacks: Array.from({ length: 25 }, (_, index) => ({
        ...feedback,
        id: `feedback-${index + 1}`,
        code: `FK-${String(index + 1).padStart(3, '0')}`,
        submittedAt: new Date(Date.UTC(2026, 7, 17, 4, 0, 25 - index)).toISOString(),
      })),
    }
    storage.setItem(USER_SERVICE_STORAGE_KEY, JSON.stringify({ schemaVersion: USER_SERVICE_SCHEMA_VERSION, snapshot }))
    const useStore = createUserServiceStore(new LocalUserService({ storage }), 'user-service-page-test')
    const store = useStore()
    await store.load()

    expect(store.paginatedFeedbacks).toHaveLength(USER_SERVICE_PAGE_SIZE)
    expect(store.pageCount).toBe(2)
    store.setPage(2)
    expect(store.paginatedFeedbacks).toHaveLength(5)
    store.setPage(99)
    expect(store.currentPage).toBe(2)
  })

  it('updates feedback and contacts immediately after service mutations', async () => {
    let idIndex = 0
    const service = new LocalUserService({
      storage: new MemoryStorage(),
      createId: () => `generated-${++idIndex}`,
      now: () => new Date('2026-08-17T04:00:00.000Z'),
    })
    const useStore = createUserServiceStore(service, 'user-service-mutation-test')
    const store = useStore()
    await store.load()
    const actor = { id: 'user-admin', name: '管理员' }
    const pending = store.snapshot.feedbacks.find((item) => item.status === 'pending')!

    expect(await store.handleFeedback(pending.id, { remark: '处理完成', markProcessed: true, actor })).toMatchObject({ status: 'processed' })
    expect(store.pendingCount).toBe(2)

    const created = await store.createContact({ name: '咨询热线', phone: '13800138000', sort: 3, displayEnabled: false }, actor)
    expect(store.contacts.at(-1)?.id).toBe(created?.id)
    expect(await store.removeContact(created!.id, actor)).toBe(true)
    expect(store.contacts.some((item) => item.id === created!.id)).toBe(false)
    expect(store.snapshot.auditLogs).toHaveLength(3)
  })

  it('converts timestamps to the fixed Asia/Shanghai calendar day', () => {
    expect(toShanghaiDateKey('2026-08-12T16:30:00.000Z')).toBe('2026-08-13')
    expect(toShanghaiDateKey('invalid')).toBe('')
  })
})
