import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  BannerPage,
  BannerRecord,
  BannerServerQuery,
  BannerWriteInput,
  ContentExportFile,
  ContentManagementService,
  ContentManagementTab,
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
import { CONTENT_MANAGEMENT_PAGE_SIZE, createContentManagementStore, DEFAULT_ACTIVITY_QUERY, DEFAULT_NEWS_QUERY, DEFAULT_BANNER_QUERY, DEFAULT_HINT_QUERY } from './content-management-store'

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
    pinned: false, priority: 50, enabled: true,
    activityStartAt: null, activityEndAt: null, activityLocation: '', navigationLocation: '', ...overrides,
  }
}

class StubContentManagementService implements ContentManagementService {
  contents: ContentRecord[] = []
  banners: BannerRecord[] = []
  hints: PriorityHintRecord[] = []
  contentQueries: ContentServerQuery[] = []
  exportQueries: ContentServerQuery[] = []
  bannerQueries: BannerServerQuery[] = []
  hintQueries: PriorityHintServerQuery[] = []
  detailReads: string[] = []
  referenceReads: ReferenceType[] = []
  failDelete: Error | null = null
  pageCalls: Array<[ContentManagementTab, number, number]> = []

  async listContentPage(page: number, pageSize: number, query: ContentServerQuery): Promise<ContentPage> {
    this.contentQueries.push({ ...query })
    const types = Array.isArray(query.contentType) ? query.contentType : [query.contentType]
    this.pageCalls.push([types.includes('activity') ? 'activity' : 'news', page, pageSize])
    const records = this.contents.filter(item => types.includes(item.type)
      && (!query.keyword || item.title.includes(query.keyword) || item.code.includes(query.keyword))
      && (query.publishStatus === 'all' || item.publishStatus === query.publishStatus)
      && (!query.enabled || query.enabled === 'all' || item.enabled === (query.enabled === 'enabled'))
      && (!query.pinned || query.pinned === 'all' || item.pinned === (query.pinned === 'pinned')))
    return { records: structuredClone(records.slice((page - 1) * pageSize, page * pageSize)), total: records.length, page, pageSize }
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

  async listBannerPage(page: number, pageSize: number, query: BannerServerQuery): Promise<BannerPage> {
    this.bannerQueries.push({ ...query })
    this.pageCalls.push(['banner', page, pageSize])
    const records = this.banners.filter(item => (!query.keyword || item.title.includes(query.keyword))
      && (query.jumpType === 'all' || item.jumpType === query.jumpType)
      && (query.enabled === 'all' || item.displayEnabled === (query.enabled === 'enabled')))
    return { records: structuredClone(records.slice((page - 1) * pageSize, page * pageSize)), total: records.length, page, pageSize }
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

  async listPriorityHintPage(page: number, pageSize: number, query: PriorityHintServerQuery): Promise<PriorityHintPage> {
    this.hintQueries.push({ ...query })
    this.pageCalls.push(['hint', page, pageSize])
    const records = this.hints.filter(item => (!query.keyword || item.title.includes(query.keyword))
      && (query.referenceType === 'all' || item.referenceType === query.referenceType)
      && (query.enabled === 'all' || item.displayEnabled === (query.enabled === 'enabled')))
    return { records: structuredClone(records.slice((page - 1) * pageSize, page * pageSize)), total: records.length, page, pageSize }
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

  async exportContents(query: ContentServerQuery): Promise<ContentExportFile> { this.exportQueries.push({ ...query }); return { content: new Blob(['csv']), filename: 'contents.csv' } }
}

describe('content management store', () => {
  let service: StubContentManagementService

  beforeEach(() => {
    setActivePinia(createPinia())
    service = new StubContentManagementService()
  })

  it('loads tabs on demand and forwards content queries to the server', async () => {
    service.contents = [
      content('1', { type: 'activity', title: '夜间比赛', activityStartAt: '2026-08-29T18:00:00+08:00', activityEndAt: '2026-08-29T20:00:00+08:00' }),
      content('2', { type: 'news', title: '场馆资讯' }),
      content('3', { type: 'notice', title: '接驳公告', publishStatus: 'draft', enabled: false }),
    ]
    service.banners = [banner('1')]
    service.hints = [hint('1')]
    const store = createContentManagementStore(service, 'content-filter')()

    expect(await store.load('activity')).toBe(true)
    expect(service.pageCalls).toEqual([['activity', 1, 20]])
    expect(await store.loadTab('news')).toBe(true)
    expect(store.activityRecords.map(item => item.id)).toEqual(['1'])
    expect(store.newsRecords.map(item => item.id)).toEqual(['2', '3'])
    expect(store.selectableReferences.some(item => item.id === '99')).toBe(true)
    expect(service.contentQueries.filter(query => Array.isArray(query.contentType))).toEqual([
      { keyword: '', contentType: ['news', 'notice'], publishStatus: 'all', enabled: 'all', pinned: 'all' },
    ])
    expect(service.referenceReads).toEqual(['activity', 'news', 'notice', 'traffic-control'])

    await store.setNewsQuery({ type: 'notice', publishStatus: 'draft', pinned: 'all', enabled: 'disabled', title: '接驳' })
    expect(service.contentQueries.at(-1)).toEqual({ keyword: '接驳', contentType: 'notice', publishStatus: 'draft', enabled: 'disabled', pinned: 'all' })
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

  it('requests server pages and resets all tab pages when the shared page size changes', async () => {
    service.contents = Array.from({ length: 21 }, (_, index) => content(String(index + 1), {
      type: 'news', priority: index === 20 ? 0 : index + 1,
    }))
    const store = createContentManagementStore(service, 'content-pages')()
    await store.load('news')
    expect(store.newsRecords).toHaveLength(CONTENT_MANAGEMENT_PAGE_SIZE)
    expect(store.newsRecords[0]?.id).toBe('1')
    expect(store.totals.news).toBe(21)
    expect(service.pageCalls).toEqual([['news', 1, 20]])
    await store.setPage('news', 2)
    expect(store.newsRecords).toHaveLength(1)

    await store.setPageSize(50, 'news')
    expect(store.pageSize).toBe(50)
    expect(store.pages.news).toBe(1)
    expect(store.newsRecords).toHaveLength(21)
  })

  it('reads latest details and refreshes lists/references after CRUD and quick actions', async () => {
    service.contents = [content('1', { title: '接口最新标题', publishStatus: 'draft', publishAt: null })]
    service.banners = [banner('1')]
    service.hints = [hint('1')]
    const store = createContentManagementStore(service, 'content-crud')()
    await store.load('news')

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
    await expect(store.exportContents('news')).resolves.toMatchObject({ filename: 'contents.csv' })
    expect(store.isExporting).toBe(false)
  })

  it('exports the active content tab using the same filters as its list', async () => {
    const store = createContentManagementStore(service, 'content-export-filters')()
    await store.setActivityQuery({ title: '赛事', publishStatus: 'published', activityStatus: 'not-started', enabled: 'disabled', pinned: 'not-pinned' })
    await store.exportContents('activity')
    expect(service.exportQueries.at(-1)).toEqual(service.contentQueries.at(-1))
    expect(service.exportQueries.at(-1)).toMatchObject({ contentType: 'activity', activityStatus: 'not-started', enabled: 'disabled', pinned: 'not-pinned' })
    await store.setNewsQuery({ title: '通知', type: 'all', publishStatus: 'draft', enabled: 'enabled', pinned: 'pinned' })
    await store.exportContents('news')
    expect(service.exportQueries.at(-1)).toEqual(service.contentQueries.at(-1))
    expect(service.exportQueries.at(-1)).toMatchObject({ contentType: ['news', 'notice'], keyword: '通知' })
    expect(service.exportQueries.at(-1)).not.toHaveProperty('activityStatus')
  })

  it('does no local reference pre-check and preserves the backend delete reason after refresh', async () => {
    service.contents = [content('1', { publishStatus: 'draft' })]
    service.banners = [banner('1', { jumpType: 'news', targetId: '1', targetTitle: '内容 1' })]
    const store = createContentManagementStore(service, 'content-delete')()
    await store.load('news')
    service.failDelete = new Error('内容仍被 1 个 Banner 引用')

    expect(await store.removeContent('1', 'news')).toBe(false)
    expect(store.error).toBe('内容仍被 1 个 Banner 引用')
    expect(store.newsRecords.some(item => item.id === '1')).toBe(true)
  })

  it('uses backend records, order and totals for all four tabs without local filtering', async () => {
    const store = createContentManagementStore(service, 'content-authority')()
    const contentPage = { records: [content('2'), content('1', { pinned: true })], total: 47, page: 1, pageSize: 20 }
    const readContents = vi.spyOn(service, 'listContentPage').mockResolvedValue(contentPage)
    await store.setActivityQuery({ ...DEFAULT_ACTIVITY_QUERY, title: '比赛', activityStatus: 'not-started', enabled: 'disabled', pinned: 'not-pinned' })
    expect(readContents).toHaveBeenLastCalledWith(1, 20, { keyword: '比赛', contentType: 'activity', publishStatus: 'all', activityStatus: 'not-started', enabled: 'disabled', pinned: 'not-pinned' })
    expect(store.activityRecords).toEqual(contentPage.records)
    expect(store.totals.activity).toBe(47)
    await store.setNewsQuery({ ...DEFAULT_NEWS_QUERY, title: '公告', type: 'notice', enabled: 'disabled' })
    expect(store.newsRecords).toEqual(contentPage.records)
    expect(store.totals.news).toBe(47)
    const bannerPage = { records: [banner('2', { priority: 99 }), banner('1', { priority: 1 })], total: 42, page: 1, pageSize: 20 }
    const readBanners = vi.spyOn(service, 'listBannerPage').mockResolvedValue(bannerPage)
    await store.setBannerQuery({ title: '赛事', jumpType: 'activity', enabled: 'disabled' })
    expect(readBanners).toHaveBeenLastCalledWith(1, 20, { keyword: '赛事', jumpType: 'activity', enabled: 'disabled' })
    expect(store.bannerRecords).toEqual(bannerPage.records)
    expect(store.totals.banner).toBe(42)
    const hintPage = { records: [hint('2', { priority: 99 }), hint('1', { priority: 1 })], total: 31, page: 1, pageSize: 20 }
    const readHints = vi.spyOn(service, 'listPriorityHintPage').mockResolvedValue(hintPage)
    await store.setHintQuery({ title: '入场', referenceType: 'activity', enabled: 'disabled' })
    expect(readHints).toHaveBeenLastCalledWith(1, 20, { keyword: '入场', referenceType: 'activity', enabled: 'disabled' })
    expect(store.priorityHintRecords).toEqual(hintPage.records)
    expect(store.totals.hint).toBe(31)
    expect(store).not.toHaveProperty('activePriorityHintIds')
  })

  it('keeps tab filters and pages independent and fetches only the visible tab on timed refresh', async () => {
    service.contents = Array.from({ length: 45 }, (_, index) => content(String(index + 1)))
    service.banners = Array.from({ length: 25 }, (_, index) => banner(String(index + 1)))
    const store = createContentManagementStore(service, 'content-tab-state')()
    await store.load('news')
    await store.setNewsQuery({ ...DEFAULT_NEWS_QUERY, title: '内容', enabled: 'enabled' })
    await store.setPage('news', 2)
    await store.loadTab('banner')
    await store.setPage('banner', 2)
    await store.loadTab('news')
    expect(service.pageCalls.at(-1)).toEqual(['news', 2, 20])
    expect(store.pages.banner).toBe(2)
    expect(store.newsRecords[0]?.id).toBe('21')
    expect(service.contentQueries.at(-1)?.keyword).toBe('内容')
    const beforeRefresh = service.pageCalls.length
    await store.refreshTemporalState('news')
    expect(service.pageCalls.slice(beforeRefresh)).toEqual([['news', 2, 20]])
    await store.loadTab('banner')
    const beforeBannerTick = service.pageCalls.length
    await store.refreshTemporalState('banner')
    expect(service.pageCalls).toHaveLength(beforeBannerTick)
    await store.setPageSize(50, 'banner')
    expect(store.pages.news).toBe(1)
    expect(store.newsRecords).toEqual([])
    await store.loadTab('news')
    expect(service.pageCalls.at(-1)).toEqual(['news', 1, 50])
    expect(store.newsRecords).toHaveLength(45)
    expect(service.referenceReads).toHaveLength(4)
  })

  it('retains applied conditions, data and page size on failed queries, pages, resets and size changes', async () => {
    service.banners = Array.from({ length: 45 }, (_, index) => banner(String(index + 1)))
    const store = createContentManagementStore(service, 'content-query-failure')()
    const filters = { ...DEFAULT_BANNER_QUERY, title: 'Banner' }
    await store.setBannerQuery(filters)
    await store.setPage('banner', 2)
    const previous = structuredClone(service.banners.slice(20, 40))
    vi.spyOn(service, 'listBannerPage').mockRejectedValue(new Error('列表请求失败'))
    for (const request of [
      () => store.setBannerQuery({ ...filters, enabled: 'disabled' }),
      () => store.setPage('banner', 3),
      () => store.resetQuery('banner'),
      () => store.setPageSize(50, 'banner'),
    ]) {
      expect(await request()).toBe(false)
      expect(store.bannerRecords).toEqual(previous)
      expect(store.bannerQuery).toEqual(filters)
      expect(store.pages.banner).toBe(2)
      expect(store.pageSize).toBe(20)
      expect(store.totals.banner).toBe(45)
      expect(store.error).toBe('列表请求失败')
      expect(store.isLoading).toBe(false)
    }
  })

  it('ignores older searches and requests made before a shared page-size change', async () => {
    service.contents = [content('1')]
    service.banners = [banner('1')]
    const store = createContentManagementStore(service, 'content-race')()
    let finishOlder!: (page: ContentPage) => void
    vi.spyOn(service, 'listContentPage').mockImplementationOnce(() => new Promise(resolve => { finishOlder = resolve }))
    const older = store.setNewsQuery({ ...DEFAULT_NEWS_QUERY, title: '旧查询' })
    await store.setNewsQuery(DEFAULT_NEWS_QUERY)
    finishOlder({ records: [content('old')], total: 100, page: 1, pageSize: 20 })
    await older
    expect(store.newsQuery.title).toBe('')
    expect(store.newsRecords.map(item => item.id)).toEqual(['1'])
    let finishOldSize!: (page: ContentPage) => void
    vi.spyOn(service, 'listContentPage').mockImplementationOnce(() => new Promise(resolve => { finishOldSize = resolve }))
    const oldSize = store.loadTab('news')
    await store.setPageSize(50, 'banner')
    finishOldSize({ records: [content('stale')], total: 100, page: 3, pageSize: 20 })
    await oldSize
    expect(store.pageSize).toBe(50)
    expect(store.pages.news).toBe(1)
    expect(store.newsRecords).toEqual([])
    expect(store.bannerRecords.map(item => item.id)).toEqual(['1'])
    expect(store.isLoading).toBe(false)
  })

  it('refreshes filtered results after mutations and backs up when the last page disappears', async () => {
    service.hints = Array.from({ length: 21 }, (_, index) => hint(String(index + 1)))
    const store = createContentManagementStore(service, 'content-last-page')()
    await store.setHintQuery({ ...DEFAULT_HINT_QUERY, enabled: 'enabled' })
    await store.setPage('hint', 2)
    expect(store.priorityHintRecords.map(item => item.id)).toEqual(['21'])
    expect(await store.setPriorityHintEnabled('21', false)).toBe(true)
    expect(service.pageCalls.slice(-2)).toEqual([['hint', 2, 20], ['hint', 1, 20]])
    expect(store.pages.hint).toBe(1)
    expect(store.totals.hint).toBe(20)
    expect(store.priorityHintRecords).toHaveLength(20)
    expect(service.hintQueries.at(-1)?.enabled).toBe('enabled')
    await store.resetQuery('hint')
    await store.setPage('hint', 2)
    expect(await store.removePriorityHint('21')).toBe(true)
    expect(store.totals.hint).toBe(20)
    expect(store.pages.hint).toBe(1)
    expect(service.pageCalls.slice(-2)).toEqual([['hint', 2, 20], ['hint', 1, 20]])
  })

  it('returns success with a warning if a write succeeds but the list or references cannot refresh', async () => {
    service.contents = Array.from({ length: 21 }, (_, index) => content(String(index + 1)))
    const store = createContentManagementStore(service, 'content-write-warning')()
    await store.load('news')
    await store.setPage('news', 2)
    const before = store.newsRecords.map(item => item.id)
    const read = vi.spyOn(service, 'listContentPage').mockRejectedValueOnce(new Error('列表不可用'))
    expect(await store.createContent(input())).toBe(true)
    expect(read).toHaveBeenLastCalledWith(1, 20, expect.any(Object))
    expect(store.newsRecords.map(item => item.id)).toEqual(before)
    expect(store.pages.news).toBe(2)
    expect(store.error).toBe('操作已成功，但最新数据刷新失败：列表不可用')
    vi.spyOn(service, 'listReferenceOptions').mockRejectedValue(new Error('引用不可用'))
    expect(await store.setContentEnabled('1', false, 'news')).toBe(true)
    expect(store.error).toBe('操作已成功，但最新数据刷新失败：引用不可用')
    expect(store.isSaving).toBe(false)
  })


  it('uses the pending shared page size when switching tabs before the size request finishes', async () => {
    service.contents = Array.from({ length: 45 }, (_, index) => content(String(index + 1)))
    service.banners = Array.from({ length: 45 }, (_, index) => banner(String(index + 1)))
    const store = createContentManagementStore(service, 'content-size-switch-race')()
    await store.load('news')
    await store.setPage('news', 2)
    let finishSize!: (page: ContentPage) => void
    vi.spyOn(service, 'listContentPage').mockImplementationOnce(() => new Promise(resolve => { finishSize = resolve }))
    const changingSize = store.setPageSize(50, 'news')
    await store.loadTab('banner')
    expect(service.pageCalls.at(-1)).toEqual(['banner', 1, 50])
    expect(store.bannerRecords).toHaveLength(45)
    finishSize({ records: structuredClone(service.contents), total: 45, page: 1, pageSize: 50 })
    await changingSize
    expect(store.pageSize).toBe(50)
    expect(store.bannerRecords).toHaveLength(45)
    expect(store.newsRecords).toHaveLength(45)
    expect(store.pages.news).toBe(1)
    expect(store.pages.banner).toBe(1)
    expect(store.isLoading).toBe(false)
  })

})
