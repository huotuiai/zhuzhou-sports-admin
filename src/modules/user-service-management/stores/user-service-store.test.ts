import type {
  ContactNumber,
  FeedbackPage,
  FeedbackQuery,
  UserFeedback,
  UserServiceService,
} from '../types'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createUserServiceStore, DEFAULT_FEEDBACK_QUERY, validateFeedbackQuery } from './user-service-store'

const timestamp = '2026-08-26T08:00:00+08:00'

function feedback(overrides: Partial<UserFeedback> = {}): UserFeedback {
  return {
    id: '1', code: 'FK-001', type: 'suggestion', content: '建议增加提醒。', contact: null,
    submittedAt: timestamp, status: 'pending', handlerId: null, handlerName: null,
    handledAt: null, handlingRemark: '', ...overrides,
  }
}

function contact(overrides: Partial<ContactNumber> = {}): ContactNumber {
  return {
    id: '1', name: '服务热线', phone: '0731-22286666', sort: 1, displayEnabled: true,
    enabled: true, createdAt: timestamp, updatedAt: timestamp, ...overrides,
  }
}

function page(
  feedbacks: UserFeedback[],
  total = feedbacks.length,
  currentPage = 1,
  pageSize = 20,
): FeedbackPage {
  return { feedbacks, total, page: currentPage, pageSize }
}

function createService(overrides: Partial<UserServiceService> = {}): UserServiceService {
  return {
    listFeedbacks: async () => page([]),
    getFeedback: async id => feedback({ id }),
    handleFeedback: async (id, input) => feedback({
      id, status: 'processed', handlingRemark: input.remark, handlerId: '9', handlerName: '管理员', handledAt: timestamp,
    }),
    exportFeedbacks: async () => ({ content: new Blob(['csv']), filename: 'feedbacks.csv' }),
    listContacts: async () => [],
    createContact: async input => contact({ ...input }),
    updateContact: async (id, input) => contact({ id, ...input }),
    deleteContact: async () => undefined,
    ...overrides,
  }
}

describe('user service store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('initializes feedback, contacts and independent overview counts from the server', async () => {
    const listFeedbacks = vi.fn(async (query: FeedbackQuery, _page: number, pageSize: number) => {
      if (pageSize === 1 && query.status === 'pending') return page([], 3, 1, 1)
      if (pageSize === 1) return page([], 8, 1, 1)
      return page([feedback()], 8)
    })
    const useStore = createUserServiceStore(createService({
      listFeedbacks,
      listContacts: async () => [contact({ id: '2', sort: 2 }), contact({ id: '1', sort: 1 })],
    }), 'user-service-initialize-test')
    const store = useStore()

    expect(await store.initialize()).toBe(true)
    expect(store.feedbacks).toHaveLength(1)
    expect(store.contacts.map(item => item.id)).toEqual(['1', '2'])
    expect(store.overallTotal).toBe(8)
    expect(store.pendingCount).toBe(3)
    expect(store.processedCount).toBe(5)
  })

  it('refreshes the current page for the same query and resets to page one for a new route query', async () => {
    let revision = 1
    let contacts = [contact({ id: '1', name: '旧热线' })]
    const listFeedbacks = vi.fn(async (query: FeedbackQuery, requestedPage: number, pageSize: number) => {
      if (pageSize === 1 && query.status === 'pending') return page([], revision === 1 ? 3 : 5, 1, 1)
      if (pageSize === 1) return page([], revision === 1 ? 8 : 12, 1, 1)
      return page([feedback({ id: `${revision}-${requestedPage}` })], 41, requestedPage, pageSize)
    })
    const store = createUserServiceStore(createService({
      listFeedbacks,
      listContacts: async () => contacts,
    }), 'user-service-refresh-test')()
    await store.initialize()
    await store.changePage(2)

    revision = 2
    contacts = [contact({ id: '2', name: '新热线' })]
    await expect(store.refresh({ ...DEFAULT_FEEDBACK_QUERY })).resolves.toBe(true)
    expect(store.feedbacks[0]?.id).toBe('2-2')
    expect(store.page).toBe(2)
    expect(store.contacts).toEqual([contact({ id: '2', name: '新热线' })])
    expect(store.overallTotal).toBe(12)
    expect(store.pendingCount).toBe(5)

    await expect(store.refresh({ ...DEFAULT_FEEDBACK_QUERY, status: 'pending' })).resolves.toBe(true)
    expect(store.feedbacks[0]?.id).toBe('2-1')
    expect(store.page).toBe(1)
    expect(store.query.status).toBe('pending')
  })

  it('uses server pagination and retains the applied page and query when a request fails', async () => {
    let fail = false
    const listFeedbacks = vi.fn(async (_query: FeedbackQuery, requestedPage: number, pageSize: number) => {
      if (fail) throw new Error('网络异常')
      return page([feedback({ id: String(requestedPage) })], 41, requestedPage, pageSize)
    })
    const useStore = createUserServiceStore(createService({ listFeedbacks }), 'user-service-pagination-test')
    const store = useStore()

    expect(await store.queryFeedbacks({ ...DEFAULT_FEEDBACK_QUERY, type: 'complaint' })).toBe(true)
    expect(await store.changePage(2)).toBe(true)
    expect(store.page).toBe(2)
    expect(store.feedbacks[0]?.id).toBe('2')

    fail = true
    expect(await store.queryFeedbacks({ ...DEFAULT_FEEDBACK_QUERY, status: 'processed' })).toBe(false)
    expect(store.query.type).toBe('complaint')
    expect(store.page).toBe(2)
    expect(store.feedbacks[0]?.id).toBe('2')
  })

  it('requests the selected page size from the server and returns to page 1', async () => {
    const listFeedbacks = vi.fn(async (_query: FeedbackQuery, requestedPage: number, pageSize: number) => (
      page([feedback({ id: String(requestedPage) })], 41, requestedPage, pageSize)
    ))
    const store = createUserServiceStore(createService({ listFeedbacks }), 'user-service-page-size-test')()

    expect(await store.queryFeedbacks({ ...DEFAULT_FEEDBACK_QUERY, type: 'complaint' })).toBe(true)
    expect(await store.changePage(2)).toBe(true)
    expect(await store.changePageSize(50)).toBe(true)
    expect(store.page).toBe(1)
    expect(store.pageSize).toBe(50)
    expect(listFeedbacks.mock.calls.at(-1)).toEqual([expect.objectContaining({ type: 'complaint' }), 1, 50])
  })

  it('rejects reversed dates without sending a request', async () => {
    const listFeedbacks = vi.fn(async () => page([]))
    const useStore = createUserServiceStore(createService({ listFeedbacks }), 'user-service-date-test')
    const store = useStore()
    const invalid = { ...DEFAULT_FEEDBACK_QUERY, startDate: '2026-08-26', endDate: '2026-08-25' }

    expect(await store.queryFeedbacks(invalid)).toBe(false)
    expect(listFeedbacks).not.toHaveBeenCalled()
    expect(store.queryError).toBe('开始日期不能晚于结束日期')
    expect(validateFeedbackQuery(DEFAULT_FEEDBACK_QUERY)).toBeNull()
  })

  it('reloads the current feedback page, falls back one page, and refreshes counts after handling', async () => {
    const listFeedbacks = vi.fn(async (query: FeedbackQuery, requestedPage: number, pageSize: number) => {
      if (pageSize === 1 && query.status === 'pending') return page([], 19, 1, 1)
      if (pageSize === 1) return page([], 20, 1, 1)
      if (requestedPage === 2) return page([], 20, 2, 20)
      return page([feedback({ id: '2' })], 20, 1, 20)
    })
    const handleFeedback = vi.fn(async () => feedback({ id: '21', status: 'processed', handlingRemark: '已回访' }))
    const useStore = createUserServiceStore(createService({ listFeedbacks, handleFeedback }), 'user-service-handle-test')
    const store = useStore()
    store.page = 2
    store.feedbacks = [feedback({ id: '21' })]

    expect(await store.handleFeedback('21', { remark: '已回访' })).toMatchObject({ status: 'processed' })
    expect(store.page).toBe(1)
    expect(store.overallTotal).toBe(20)
    expect(store.pendingCount).toBe(19)
    expect(handleFeedback).toHaveBeenCalledWith('21', { remark: '已回访' })
  })

  it('updates and sorts contacts after real service mutations', async () => {
    const createContact = vi.fn(async () => contact({ id: '2', name: '咨询热线', sort: 2 }))
    const updateContact = vi.fn(async () => contact({ id: '2', name: '第一热线', sort: 1 }))
    const deleteContact = vi.fn(async () => undefined)
    const useStore = createUserServiceStore(createService({ createContact, updateContact, deleteContact }), 'user-service-contact-test')
    const store = useStore()
    store.contacts = [contact({ id: '1', sort: 3 })]
    const input = { name: '咨询热线', phone: '400-123-4567', sort: 2, displayEnabled: true }

    expect(await store.createContact(input)).toMatchObject({ id: '2' })
    expect(store.contacts.map(item => item.id)).toEqual(['2', '1'])
    expect(await store.updateContact('2', { ...input, name: '第一热线', sort: 1 })).toMatchObject({ name: '第一热线' })
    expect(await store.deleteContact('2')).toBe(true)
    expect(store.contacts.map(item => item.id)).toEqual(['1'])
  })
})
