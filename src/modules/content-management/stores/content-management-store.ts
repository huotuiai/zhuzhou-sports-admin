import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ActivityQuery,
  BannerQuery,
  BannerRecord,
  BannerWriteInput,
  ContentExportFile,
  ContentManagementService,
  ContentManagementSnapshot,
  ContentManagementTab,
  ContentRecord,
  ContentServerQuery,
  ContentWriteInput,
  NewsQuery,
  PriorityHintQuery,
  PriorityHintRecord,
  PriorityHintWriteInput,
  ReferenceType,
  SelectableReference,
} from '../types'
import {
  contentManagementService,
  getActivityStatus,
  isBannerEffective,
  isPriorityHintEffective,
  sortBanners,
  sortContents,
  sortPriorityHints,
} from '../services/content-management-service'

export const CONTENT_MANAGEMENT_PAGE_SIZE = 20

export const DEFAULT_ACTIVITY_QUERY: ActivityQuery = {
  publishStatus: 'all', activityStatus: 'all', pinned: 'all', enabled: 'all', title: '',
}

export const DEFAULT_NEWS_QUERY: NewsQuery = {
  type: 'all', publishStatus: 'all', pinned: 'all', enabled: 'all', title: '',
}

export const DEFAULT_BANNER_QUERY: BannerQuery = { jumpType: 'all', enabled: 'all', title: '' }
export const DEFAULT_HINT_QUERY: PriorityHintQuery = { referenceType: 'all', enabled: 'all', title: '' }

const REFERENCE_TYPES: readonly ReferenceType[] = ['activity', 'news', 'notice', 'traffic-control']

function normalizedIncludes(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN'))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function emptySnapshot(): ContentManagementSnapshot {
  return { contents: [], banners: [], priorityHints: [] }
}

function contentServerQuery(type: ContentServerQuery['contentType'], query: Pick<ActivityQuery, 'title' | 'publishStatus'>): ContentServerQuery {
  return { keyword: query.title, contentType: type, publishStatus: query.publishStatus }
}

export function createContentManagementStore(
  service: ContentManagementService,
  storeId = 'content-management',
) {
  return defineStore(storeId, () => {
    const snapshot = ref<ContentManagementSnapshot>(emptySnapshot())
    const referencesByType = reactive<Record<ReferenceType, SelectableReference[]>>({
      activity: [], news: [], notice: [], 'traffic-control': [],
    })
    const activityQuery = reactive<ActivityQuery>({ ...DEFAULT_ACTIVITY_QUERY })
    const newsQuery = reactive<NewsQuery>({ ...DEFAULT_NEWS_QUERY })
    const bannerQuery = reactive<BannerQuery>({ ...DEFAULT_BANNER_QUERY })
    const hintQuery = reactive<PriorityHintQuery>({ ...DEFAULT_HINT_QUERY })
    const pages = reactive<Record<ContentManagementTab, number>>({ activity: 1, news: 1, banner: 1, hint: 1 })
    const now = ref(Date.now())
    const isLoading = ref(false)
    const isSaving = ref(false)
    const isExporting = ref(false)
    const detailLoadingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const activityRecords = computed(() => sortContents(snapshot.value.contents.filter((record) => {
      if (record.type !== 'activity') return false
      if (activityQuery.publishStatus !== 'all' && record.publishStatus !== activityQuery.publishStatus) return false
      if (activityQuery.activityStatus !== 'all' && getActivityStatus(record, new Date(now.value)) !== activityQuery.activityStatus) return false
      if (activityQuery.pinned === 'pinned' && !record.pinned) return false
      if (activityQuery.pinned === 'not-pinned' && record.pinned) return false
      if (activityQuery.enabled === 'enabled' && !record.enabled) return false
      if (activityQuery.enabled === 'disabled' && record.enabled) return false
      return !activityQuery.title.trim() || normalizedIncludes(record.title, activityQuery.title) || normalizedIncludes(record.code, activityQuery.title)
    })))

    const newsRecords = computed(() => sortContents(snapshot.value.contents.filter((record) => {
      if (record.type === 'activity') return false
      if (newsQuery.type !== 'all' && record.type !== newsQuery.type) return false
      if (newsQuery.publishStatus !== 'all' && record.publishStatus !== newsQuery.publishStatus) return false
      if (newsQuery.pinned === 'pinned' && !record.pinned) return false
      if (newsQuery.pinned === 'not-pinned' && record.pinned) return false
      if (newsQuery.enabled === 'enabled' && !record.enabled) return false
      if (newsQuery.enabled === 'disabled' && record.enabled) return false
      return !newsQuery.title.trim() || normalizedIncludes(record.title, newsQuery.title) || normalizedIncludes(record.code, newsQuery.title)
    })))

    const bannerRecords = computed(() => sortBanners(snapshot.value.banners.filter((record) => {
      if (bannerQuery.jumpType !== 'all' && record.jumpType !== bannerQuery.jumpType) return false
      if (bannerQuery.enabled === 'enabled' && !record.displayEnabled) return false
      if (bannerQuery.enabled === 'disabled' && record.displayEnabled) return false
      return !bannerQuery.title.trim() || normalizedIncludes(record.title, bannerQuery.title) || normalizedIncludes(record.code, bannerQuery.title)
    })))

    const priorityHintRecords = computed(() => sortPriorityHints(snapshot.value.priorityHints.filter((record) => {
      if (hintQuery.referenceType !== 'all' && record.referenceType !== hintQuery.referenceType) return false
      if (hintQuery.enabled === 'enabled' && !record.displayEnabled) return false
      if (hintQuery.enabled === 'disabled' && record.displayEnabled) return false
      return !hintQuery.title.trim() || normalizedIncludes(record.title, hintQuery.title) || normalizedIncludes(record.code, hintQuery.title)
    })))

    function paginated<T>(records: readonly T[], tab: ContentManagementTab): T[] {
      const maxPage = Math.max(1, Math.ceil(records.length / CONTENT_MANAGEMENT_PAGE_SIZE))
      const page = Math.min(Math.max(pages[tab], 1), maxPage)
      return records.slice((page - 1) * CONTENT_MANAGEMENT_PAGE_SIZE, page * CONTENT_MANAGEMENT_PAGE_SIZE)
    }

    const paginatedActivities = computed(() => paginated(activityRecords.value, 'activity'))
    const paginatedNews = computed(() => paginated(newsRecords.value, 'news'))
    const paginatedBanners = computed(() => paginated(bannerRecords.value, 'banner'))
    const paginatedPriorityHints = computed(() => paginated(priorityHintRecords.value, 'hint'))
    const bannerTotal = computed(() => snapshot.value.banners.length)
    const priorityHintTotal = computed(() => snapshot.value.priorityHints.length)
    const selectableReferences = computed(() => REFERENCE_TYPES.flatMap(type => referencesByType[type]))

    function targetIsValid(targetId: string | null): boolean {
      return Boolean(targetId && selectableReferences.value.some(reference => reference.id === targetId && reference.valid))
    }

    function bannerIsEffective(record: BannerRecord): boolean {
      return isBannerEffective(record, new Date(now.value)) && (record.jumpType === 'none' || targetIsValid(record.targetId))
    }

    function priorityHintIsEffective(record: PriorityHintRecord): boolean {
      return isPriorityHintEffective(record, new Date(now.value)) && targetIsValid(record.targetId)
    }

    const activePriorityHintIds = computed(() => sortPriorityHints(snapshot.value.priorityHints)
      .filter(priorityHintIsEffective).slice(0, 2).map(record => record.id))

    async function fetchActivities(): Promise<ContentRecord[]> {
      return service.listContents(contentServerQuery('activity', activityQuery))
    }

    async function fetchNews(): Promise<ContentRecord[]> {
      const types = newsQuery.type === 'all' ? (['news', 'notice'] as const) : newsQuery.type
      return service.listContents(contentServerQuery(types, newsQuery))
    }

    async function fetchBanners(): Promise<BannerRecord[]> {
      return service.listBanners({ keyword: bannerQuery.title, jumpType: bannerQuery.jumpType })
    }

    async function fetchHints(): Promise<PriorityHintRecord[]> {
      return service.listPriorityHints({ keyword: hintQuery.title, referenceType: hintQuery.referenceType })
    }

    async function fetchReferences(): Promise<void> {
      const groups = await Promise.all(REFERENCE_TYPES.map(type => service.listReferenceOptions(type)))
      groups.forEach((records, index) => { referencesByType[REFERENCE_TYPES[index]!] = records })
    }

    async function applyTab(tab: ContentManagementTab): Promise<void> {
      if (tab === 'activity') {
        const records = await fetchActivities()
        snapshot.value.contents = [...records, ...snapshot.value.contents.filter(item => item.type !== 'activity')]
      }
      if (tab === 'news') {
        const records = await fetchNews()
        snapshot.value.contents = [...snapshot.value.contents.filter(item => item.type === 'activity'), ...records]
      }
      if (tab === 'banner') snapshot.value.banners = await fetchBanners()
      if (tab === 'hint') snapshot.value.priorityHints = await fetchHints()
      pages[tab] = Math.min(pages[tab], Math.max(1, Math.ceil(recordsForTab(tab).length / CONTENT_MANAGEMENT_PAGE_SIZE)))
    }

    async function load(tab?: ContentManagementTab): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        if (tab) {
          await Promise.all([applyTab(tab), fetchReferences()])
        }
        else {
          const [activities, news, banners, hints] = await Promise.all([
            fetchActivities(), fetchNews(), fetchBanners(), fetchHints(), fetchReferences(),
          ])
          snapshot.value = { contents: [...activities, ...news], banners, priorityHints: hints }
        }
        now.value = Date.now()
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally { isLoading.value = false }
    }

    let inflightTab: ContentManagementTab | null = null
    let inflightLoad: Promise<boolean> | null = null

    async function loadTab(tab: ContentManagementTab): Promise<boolean> {
      if (inflightLoad && inflightTab === tab) return inflightLoad
      inflightTab = tab
      inflightLoad = (async () => {
        isLoading.value = true
        error.value = null
        try {
          await applyTab(tab)
          now.value = Date.now()
          return true
        }
        catch (cause) {
          error.value = errorMessage(cause)
          return false
        }
        finally {
          isLoading.value = false
          inflightTab = null
          inflightLoad = null
        }
      })()
      return inflightLoad
    }

    function recordsForTab(tab: ContentManagementTab): readonly unknown[] {
      if (tab === 'activity') return activityRecords.value
      if (tab === 'news') return newsRecords.value
      if (tab === 'banner') return bannerRecords.value
      return priorityHintRecords.value
    }

    async function setActivityQuery(query: ActivityQuery): Promise<boolean> {
      Object.assign(activityQuery, query)
      pages.activity = 1
      return loadTab('activity')
    }

    async function setNewsQuery(query: NewsQuery): Promise<boolean> {
      Object.assign(newsQuery, query)
      pages.news = 1
      return loadTab('news')
    }

    async function setBannerQuery(query: BannerQuery): Promise<boolean> {
      Object.assign(bannerQuery, query)
      pages.banner = 1
      return loadTab('banner')
    }

    async function setHintQuery(query: PriorityHintQuery): Promise<boolean> {
      Object.assign(hintQuery, query)
      pages.hint = 1
      return loadTab('hint')
    }

    async function resetQuery(tab: ContentManagementTab): Promise<boolean> {
      if (tab === 'activity') Object.assign(activityQuery, DEFAULT_ACTIVITY_QUERY)
      if (tab === 'news') Object.assign(newsQuery, DEFAULT_NEWS_QUERY)
      if (tab === 'banner') Object.assign(bannerQuery, DEFAULT_BANNER_QUERY)
      if (tab === 'hint') Object.assign(hintQuery, DEFAULT_HINT_QUERY)
      pages[tab] = 1
      return loadTab(tab)
    }

    function setPage(tab: ContentManagementTab, page: number): void {
      if (!Number.isFinite(page)) return
      const maxPage = Math.max(1, Math.ceil(recordsForTab(tab).length / CONTENT_MANAGEMENT_PAGE_SIZE))
      pages[tab] = Math.min(Math.max(1, Math.trunc(page)), maxPage)
    }

    async function getDetail<T>(id: string, getter: () => Promise<T>): Promise<T | null> {
      detailLoadingId.value = id
      error.value = null
      try { return await getter() }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { detailLoadingId.value = null }
    }

    const getContent = (id: string) => getDetail(id, () => service.getContent(id))
    const getBanner = (id: string) => getDetail(id, () => service.getBanner(id))
    const getPriorityHint = (id: string) => getDetail(id, () => service.getPriorityHint(id))

    async function mutate(operation: () => Promise<unknown>, tabs: readonly ContentManagementTab[], refreshReferences = false): Promise<boolean> {
      isSaving.value = true
      error.value = null
      try {
        await operation()
        await Promise.all([...tabs.map(loadTab), ...(refreshReferences ? [fetchReferences()] : [])])
        return true
      }
      catch (cause) {
        const operationError = errorMessage(cause)
        await Promise.all(tabs.map(tab => loadTab(tab))).catch(() => undefined)
        if (refreshReferences) await fetchReferences().catch(() => undefined)
        error.value = operationError
        return false
      }
      finally { isSaving.value = false }
    }

    const createContent = (input: ContentWriteInput) => mutate(() => service.createContent(input), [input.type === 'activity' ? 'activity' : 'news'], true)
    const updateContent = (id: string, input: ContentWriteInput) => mutate(() => service.updateContent(id, input), [input.type === 'activity' ? 'activity' : 'news'], true)
    const publishContent = (id: string, type: ContentRecord['type']) => mutate(() => service.publishContent(id), [type === 'activity' ? 'activity' : 'news'], true)
    const unpublishContent = (id: string, type: ContentRecord['type']) => mutate(() => service.unpublishContent(id), [type === 'activity' ? 'activity' : 'news'], true)
    const setContentPinned = (id: string, pinned: boolean, type: ContentRecord['type']) => mutate(() => service.setContentPinned(id, pinned), [type === 'activity' ? 'activity' : 'news'])
    const setContentEnabled = (id: string, enabled: boolean, type: ContentRecord['type']) => mutate(() => service.setContentEnabled(id, enabled), [type === 'activity' ? 'activity' : 'news'], true)
    const removeContent = (id: string, type: ContentRecord['type']) => mutate(() => service.removeContent(id), [type === 'activity' ? 'activity' : 'news'], true)
    const createBanner = (input: BannerWriteInput) => mutate(() => service.createBanner(input), ['banner'])
    const updateBanner = (id: string, input: BannerWriteInput) => mutate(() => service.updateBanner(id, input), ['banner'])
    const setBannerEnabled = (id: string, enabled: boolean) => mutate(() => service.setBannerEnabled(id, enabled), ['banner'])
    const removeBanner = (id: string) => mutate(() => service.removeBanner(id), ['banner'])
    const createPriorityHint = (input: PriorityHintWriteInput) => mutate(() => service.createPriorityHint(input), ['hint'])
    const updatePriorityHint = (id: string, input: PriorityHintWriteInput) => mutate(() => service.updatePriorityHint(id, input), ['hint'])
    const setPriorityHintEnabled = (id: string, enabled: boolean) => mutate(() => service.setPriorityHintEnabled(id, enabled), ['hint'])
    const removePriorityHint = (id: string) => mutate(() => service.removePriorityHint(id), ['hint'])

    async function exportContents(): Promise<ContentExportFile | null> {
      isExporting.value = true
      error.value = null
      try { return await service.exportContents() }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { isExporting.value = false }
    }

    async function refreshTemporalState(): Promise<void> {
      now.value = Date.now()
      await loadTab('activity')
      await loadTab('news')
    }

    function resetError(): void { error.value = null }

    return {
      snapshot,
      referencesByType,
      activityQuery,
      newsQuery,
      bannerQuery,
      hintQuery,
      pages,
      now,
      bannerTotal,
      priorityHintTotal,
      isLoading,
      isSaving,
      isExporting,
      detailLoadingId,
      error,
      activityRecords,
      newsRecords,
      bannerRecords,
      priorityHintRecords,
      paginatedActivities,
      paginatedNews,
      paginatedBanners,
      paginatedPriorityHints,
      selectableReferences,
      activePriorityHintIds,
      targetIsValid,
      isBannerEffective: bannerIsEffective,
      isPriorityHintEffective: priorityHintIsEffective,
      setPage,
      setActivityQuery,
      setNewsQuery,
      setBannerQuery,
      setHintQuery,
      resetQuery,
      load,
      loadTab,
      refreshTemporalState,
      getContent,
      getBanner,
      getPriorityHint,
      createContent,
      updateContent,
      publishContent,
      unpublishContent,
      setContentPinned,
      setContentEnabled,
      removeContent,
      createBanner,
      updateBanner,
      setBannerEnabled,
      removeBanner,
      createPriorityHint,
      updatePriorityHint,
      setPriorityHintEnabled,
      removePriorityHint,
      exportContents,
      resetError,
    }
  })
}

export const useContentManagementStore = createContentManagementStore(contentManagementService)
