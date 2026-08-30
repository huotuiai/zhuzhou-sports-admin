import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  BannerPage,
  BannerRecord,
  BannerServerQuery,
  BannerWriteInput,
  ContentExportFile,
  ContentManagementService,
  ContentPage,
  ContentRecord,
  ContentServerQuery,
  ContentWriteInput,
  PriorityHintPage,
  PriorityHintRecord,
  PriorityHintServerQuery,
  PriorityHintWriteInput,
  ReferenceType,
  RemoteFileAsset,
  SelectableReference,
} from '../types'
import { CONTENT_MANAGEMENT_PAGE_SIZE, createContentManagementStore } from './content-management-store'

function content(id: string, overrides: Partial<ContentRecord> = {}): ContentRecord {
  return {
    id, code: `CT-${id}`, type: 'news', title: `内容 ${id}`, bodyHtml: '<p>正文</p>', cover: null, attachments: [],
    publishStatus: 'published', publishAt: '2026-08-20T08:00:00+08:00', pinned: false, priority: 50, enabled: true,
    validStartAt: null, validEndAt: null, activityStartAt: null, activityEndAt: null, activityLocation: '',
    navAddress: '', navLng: null, navLat: null, metrics: { clickPv: 0, clickUv: 0, viewPv: 0, viewUv: 0 },
    dataSource: 'manual', syncStatus: null, lastSyncAt: null, externalId: null,
    createdAt: '2026-08-20T08:00:00+08:00', updatedAt: '2026-08-20T09:00:00+08:00', ...overrides,
  }
}

function banner(id: string, overrides: Partial<BannerRecord> = {}): BannerRecord {
  return {
    id, code: `BN-${id}`, title: `Banner ${id}`,
    image: { id: `${id}-image`, name: 'banner.jpg', url: 'https://cdn.example.com/banner.jpg', mimeType: 'image/jpeg', size: 0, sortOrder: 0 },
    jumpType: 'none', targetId: null, targetTitle: null, priority: 50, displayEnabled: true,
    validFrom: null, validTo: null, metrics: { clickPv: 0, clickUv: 0 },
    createdAt: '2026-08-20T08:00:00+08:00', updatedAt: '2026-08-20T09:00:00+08:00', ...overrides,
  }
}

function hint(id: string, overrides: Partial<PriorityHintRecord> = {}): PriorityHintRecord {
  return {
    id, code: `HI-${id}`, title: `提示 ${id}`, referenceType: 'news', targetId: '2', targetTitle: '内容 2',
    priority: 50, displayEnabled: true, validFrom: null, validTo: null, metrics: { clickPv: 0, clickUv: 0 },
    createdAt: '2026-08-20T08:00:00+08:00', updatedAt: '2026-08-20T09:00:00+08:00', ...overrides,
  }
}

function input(overrides: Partial<ContentWriteInput> = {}): ContentWriteInput {
  return {
    type: 'news', title: '新增资讯', bodyHtml: '<p>正文</p>', cover: null, attachments: [], publishAt: null,
    pinned: false, priority: 50, enabled: true, validStartAt: null, validEndAt: null,
    activityStartAt: null, activityEndAt: null, activityLocation: '', navigationLocation: '', ...overrides,
  }
}

class StubContentManagementService implements ContentManagementService {
  contents: ContentRecord[] = []
  banners: BannerRecord[] = []
  hints: PriorityHintRecord[] = []
  contentQueries: ContentServerQuery[] = []
  bannerQueries: BannerServerQuery[] = []
  hintQueries: PriorityHintServerQuery[] = []
  detailReads: string[] = []
  referenceReads: ReferenceType[] = []
  failDelete: Error | null = null

  async listContents(query: ContentServerQuery): Promise<ContentRecord[]> {
    this.contentQueries.push({ ...query })
    const types = Array.isArray(query.contentType) ? query.contentType : [query.contentType]
    return structuredClone(this.contents.filter(item => types.includes(item.type)))
  }

  async listContentPage(page: number, pageSize: number, query: ContentServerQuery): Promise<ContentPage> {
    const records = await this.listContents(query)
    return { records: records.slice((page - 1) * pageSize, page * pageSize), total: records.length, page, pageSize }
  }

  async getContent(id: string): Promise<ContentRecord> {
    this.detailReads.push(`content:${id}`)
    const record = this.contents.find(item => item.id === id)
    if (!record) throw new Error('内容不存在')
    return structuredClone(record)
  }

  async createContent(value: ContentWriteInput): Promise<ContentRecord> {
    const record = content(String(this.contents.length + 1), {
      ...value, type: value.type, cover: value.cover, attachments: value.attachments,
      activityLocation: value.activityLocation, navAddress: value.navigationLocation, publishStatus: value.publishAt ? 'published' : 'draft',
    })
    this.contents.push(record)
    return structuredClone(record)
  }

  async updateContent(id: string, value: ContentWriteInput): Promise<ContentRecord> {
    const index = this.contents.findIndex(item => item.id === id)
    if (index < 0) throw new Error('内容不存在')
    this.contents[index] = { ...this.contents[index]!, ...value, activityLocation: value.activityLocation, navAddress: value.navigationLocation }
    return structuredClone(this.contents[index]!)
  }

  async publishContent(id: string): Promise<ContentRecord> {
    const record = this.contents.find(item => item.id === id)!
    record.publishStatus = 'published'
    record.publishAt = '2026-08-21T08:00:00+08:00'
    return structuredClone(record)
  }

  async unpublishContent(id: string): Promise<ContentRecord> {
    const record = this.contents.find(item => item.id === id)!
    record.publishStatus = 'draft'
    record.publishAt = null
    return structuredClone(record)
  }

  async setContentPinned(id: string, pinned: boolean): Promise<ContentRecord> {
    const record = this.contents.find(item => item.id === id)!
    record.pinned = pinned
    return structuredClone(record)
  }

  async setContentEnabled(id: string, enabled: boolean): Promise<ContentRecord> {
    const record = this.contents.find(item => item.id === id)!
    record.enabled = enabled
    return structuredClone(record)
  }

  async replaceAttachments(id: string, attachments: readonly RemoteFileAsset[]): Promise<ContentRecord> {
    const record = this.contents.find(item => item.id === id)!
    record.attachments = structuredClone([...attachments])
    return structuredClone(record)
  }

  async removeContent(id: string): Promise<void> {
    if (this.failDelete) throw this.failDelete
    this.contents = this.contents.filter(item => item.id !== id)
  }

  async listBanners(query: BannerServerQuery): Promise<BannerRecord[]> {
    this.bannerQueries.push({ ...query })
    return structuredClone(this.banners)
  }

  async listBannerPage(page: number, pageSize: number, query: BannerServerQuery): Promise<BannerPage> {
    const records = await this.listBanners(query)
    return { records, total: records.length, page, pageSize }
  }

  async getBanner(id: string): Promise<BannerRecord> {
    this.detailReads.push(`banner:${id}`)
    return structuredClone(this.banners.find(item => item.id === id)!)
  }

  async createBanner(value: BannerWriteInput): Promise<BannerRecord> {
    const record = banner(String(this.banners.length + 1), { ...value, image: value.image!, targetTitle: null })
    this.banners.push(record)
    return structuredClone(record)
  }

  async updateBanner(id: string, value: BannerWriteInput): Promise<BannerRecord> {
    const index = this.banners.findIndex(item => item.id === id)
    this.banners[index] = { ...this.banners[index]!, ...value, image: value.image! }
    return structuredClone(this.banners[index]!)
  }

  async setBannerEnabled(id: string, enabled: boolean): Promise<BannerRecord> {
    const record = this.banners.find(item => item.id === id)!
    record.displayEnabled = enabled
    return structuredClone(record)
  }

  async removeBanner(id: string): Promise<void> { this.banners = this.banners.filter(item => item.id !== id) }

  async listPriorityHints(query: PriorityHintServerQuery): Promise<PriorityHintRecord[]> {
    this.hintQueries.push({ ...query })
    return structuredClone(this.hints)
  }

  async listPriorityHintPage(page: number, pageSize: number, query: PriorityHintServerQuery): Promise<PriorityHintPage> {
    const records = await this.listPriorityHints(query)
    return { records, total: records.length, page, pageSize }
  }

  async getPriorityHint(id: string): Promise<PriorityHintRecord> {
    this.detailReads.push(`hint:${id}`)
    return structuredClone(this.hints.find(item => item.id === id)!)
  }

  async createPriorityHint(value: PriorityHintWriteInput): Promise<PriorityHintRecord> {
    const record = hint(String(this.hints.length + 1), { ...value, targetTitle: '引用标题' })
    this.hints.push(record)
    return structuredClone(record)
  }

  async updatePriorityHint(id: string, value: PriorityHintWriteInput): Promise<PriorityHintRecord> {
    const index = this.hints.findIndex(item => item.id === id)
    this.hints[index] = { ...this.hints[index]!, ...value }
    return structuredClone(this.hints[index]!)
  }

  async setPriorityHintEnabled(id: string, enabled: boolean): Promise<PriorityHintRecord> {
    const record = this.hints.find(item => item.id === id)!
    record.displayEnabled = enabled
    return structuredClone(record)
  }

  async removePriorityHint(id: string): Promise<void> { this.hints = this.hints.filter(item => item.id !== id) }

  async listReferenceOptions(type: ReferenceType): Promise<SelectableReference[]> {
    this.referenceReads.push(type)
    if (type === 'traffic-control') return [{ id: '99', code: 'GZ-099', type, title: '测试管制', valid: true, description: '可引用' }]
    return this.contents.filter(item => item.type === type).map(item => ({ id: item.id, code: item.code, type, title: item.title, valid: true, description: '可引用' }))
  }

  async exportContents(): Promise<ContentExportFile> { return { content: new Blob(['csv']), filename: 'contents.csv' } }
}

describe('content management store', () => {
  let service: StubContentManagementService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubContentManagementService()
  })

  it('loads four API-backed tabs and combines server/client filters', async () => {
    service.contents = [
      content('1', { type: 'activity', title: '夜间比赛', activityStartAt: '2026-08-29T18:00:00+08:00', activityEndAt: '2026-08-29T20:00:00+08:00' }),
      content('2', { type: 'news', title: '场馆资讯' }),
      content('3', { type: 'notice', title: '接驳公告', publishStatus: 'draft', enabled: false }),
    ]
    service.banners = [banner('1')]
    service.hints = [hint('1')]
    const store = createContentManagementStore(service, 'content-filter')()

    expect(await store.load()).toBe(true)
    expect(store.activityRecords.map(item => item.id)).toEqual(['1'])
    expect(store.newsRecords.map(item => item.id)).toEqual(['2', '3'])
    expect(store.selectableReferences.some(item => item.id === '99')).toBe(true)
    expect(service.contentQueries.filter(query => Array.isArray(query.contentType))).toEqual([
      { keyword: '', contentType: ['news', 'notice'], publishStatus: 'all' },
    ])
    expect(service.referenceReads).toEqual(['activity', 'news', 'notice', 'traffic-control'])

    await store.setNewsQuery({ type: 'notice', publishStatus: 'draft', pinned: 'all', enabled: 'disabled', title: '接驳' })
    expect(service.contentQueries.at(-1)).toEqual({ keyword: '接驳', contentType: 'notice', publishStatus: 'draft' })
    expect(store.newsRecords.map(item => item.id)).toEqual(['3'])
  })

  it('loads only the requested tab plus reference options', async () => {
    service.contents = [content('1', { type: 'activity' }), content('2', { type: 'news' })]
    service.banners = [banner('1')]
    service.hints = [hint('1')]
    const store = createContentManagementStore(service, 'content-single-tab')()

    expect(await store.load('banner')).toBe(true)
    expect(store.bannerRecords.map(item => item.id)).toEqual(['1'])
    expect(store.activityRecords).toEqual([])
    expect(store.priorityHintRecords).toEqual([])
    expect(service.bannerQueries).toHaveLength(1)
    expect(service.contentQueries).toEqual([])
    expect(service.hintQueries).toEqual([])
    expect(service.referenceReads).toEqual(['activity', 'news', 'notice', 'traffic-control'])
  })

  it('keeps prototype twenty-row paging after automatically loaded API results', async () => {
    service.contents = Array.from({ length: 21 }, (_, index) => content(String(index + 1), {
      type: 'news', priority: index === 20 ? 0 : index + 1,
    }))
    const store = createContentManagementStore(service, 'content-pages')()
    await store.load()
    expect(store.paginatedNews).toHaveLength(CONTENT_MANAGEMENT_PAGE_SIZE)
    expect(store.newsRecords[0]?.id).toBe('20')
    store.setPage('news', 2)
    expect(store.paginatedNews).toHaveLength(1)

    store.setPageSize(50)
    expect(store.pageSize).toBe(50)
    expect(store.pages.news).toBe(1)
    expect(store.paginatedNews).toHaveLength(21)
  })

  it('reads latest details and refreshes lists/references after CRUD and quick actions', async () => {
    service.contents = [content('1', { title: '接口最新标题', publishStatus: 'draft', publishAt: null })]
    service.banners = [banner('1')]
    service.hints = [hint('1')]
    const store = createContentManagementStore(service, 'content-crud')()
    await store.load()

    await expect(store.getContent('1')).resolves.toMatchObject({ title: '接口最新标题' })
    await expect(store.getBanner('1')).resolves.toMatchObject({ title: 'Banner 1' })
    await expect(store.getPriorityHint('1')).resolves.toMatchObject({ title: '提示 1' })
    expect(service.detailReads).toEqual(['content:1', 'banner:1', 'hint:1'])

    expect(await store.createContent(input())).toBe(true)
    expect(store.newsRecords.some(item => item.title === '新增资讯')).toBe(true)
    expect(await store.publishContent('1', 'news')).toBe(true)
    expect(store.newsRecords.find(item => item.id === '1')?.publishStatus).toBe('published')
    expect(await store.setContentPinned('1', true, 'news')).toBe(true)
    expect(store.newsRecords[0]?.id).toBe('1')
    expect(await store.setBannerEnabled('1', false)).toBe(true)
    expect(store.bannerRecords[0]?.displayEnabled).toBe(false)
    expect(await store.setPriorityHintEnabled('1', false)).toBe(true)
    expect(store.priorityHintRecords[0]?.displayEnabled).toBe(false)
    await expect(store.exportContents()).resolves.toMatchObject({ filename: 'contents.csv' })
    expect(store.isExporting).toBe(false)
  })

  it('does no local reference pre-check and preserves the backend delete reason after refresh', async () => {
    service.contents = [content('1', { publishStatus: 'draft' })]
    service.banners = [banner('1', { jumpType: 'news', targetId: '1', targetTitle: '内容 1' })]
    const store = createContentManagementStore(service, 'content-delete')()
    await store.load()
    service.failDelete = new Error('内容仍被 1 个 Banner 引用')

    expect(await store.removeContent('1', 'news')).toBe(false)
    expect(store.error).toBe('内容仍被 1 个 Banner 引用')
    expect(store.snapshot.contents.some(item => item.id === '1')).toBe(true)
  })
})
