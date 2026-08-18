import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ContentWriteInput, ExternalContentReferenceService } from '../types'
import { LocalContentManagementService } from '../services/content-management-service'
import { CONTENT_MANAGEMENT_PAGE_SIZE, createContentManagementStore } from './content-management-store'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const referenceService: ExternalContentReferenceService = {
  async listTrafficControls() {
    return [{ id: 'traffic-test', code: 'GZ-T', type: 'traffic-control', title: '测试管制', enabled: true, published: true }]
  },
}

function input(index: number): ContentWriteInput {
  return {
    type: 'news',
    title: `测试资讯 ${index}`,
    bodyHtml: '<p>正文</p>',
    cover: null,
    attachments: [],
    publishAt: null,
    pinned: false,
    priority: 100 + index,
    activityStartAt: null,
    activityEndAt: null,
    activityLocation: '',
    navigationLocation: '',
  }
}

describe('content management store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads the aggregate snapshot and filters each tab independently', async () => {
    const service = new LocalContentManagementService({ storage: new MemoryStorage(), now: () => new Date('2026-08-17T04:00:00.000Z') })
    const useStore = createContentManagementStore(service, referenceService, 'content-store-filter-test')
    const store = useStore()

    expect(await store.load()).toBe(true)
    expect(store.activityRecords.every((record) => record.type === 'activity')).toBe(true)
    store.setNewsQuery({ type: 'notice', publishStatus: 'all', pinned: 'all', enabled: 'all', title: '接驳' })
    expect(store.newsRecords.map((record) => record.code)).toEqual(['CT-002'])
    expect(store.selectableReferences.some((reference) => reference.id === 'traffic-test')).toBe(true)
  })

  it('updates the snapshot after mutations and paginates at twenty rows', async () => {
    const service = new LocalContentManagementService({ storage: new MemoryStorage(), now: () => new Date('2026-08-17T04:00:00.000Z') })
    for (let index = 0; index < 21; index += 1) await service.createContent(input(index))
    const useStore = createContentManagementStore(service, referenceService, 'content-store-pagination-test')
    const store = useStore()
    await store.load()

    expect(store.paginatedNews).toHaveLength(CONTENT_MANAGEMENT_PAGE_SIZE)
    store.setPage('news', 2)
    expect(store.paginatedNews.length).toBeGreaterThan(0)

    const before = store.snapshot.contents.length
    expect(await store.createContent(input(99))).toBe(true)
    expect(store.snapshot.contents).toHaveLength(before + 1)
  })
})
