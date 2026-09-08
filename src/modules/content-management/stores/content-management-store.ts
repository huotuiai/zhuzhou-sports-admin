import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ActivityQuery,
  BannerQuery,
  BannerRecord,
  BannerWriteInput,
  ContentExportFile,
  ContentManagementService,
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
  isBannerEffective,
  isPriorityHintEffective,
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

type TabQueries = {
  activity: ActivityQuery
  news: NewsQuery
  banner: BannerQuery
  hint: PriorityHintQuery
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function contentServerQuery(type: ContentServerQuery['contentType'], query: Pick<ActivityQuery, 'title' | 'publishStatus' | 'enabled' | 'pinned'> & Partial<Pick<ActivityQuery, 'activityStatus'>>): ContentServerQuery {
  return {
    keyword: query.title,
    contentType: type,
    publishStatus: query.publishStatus,
    enabled: query.enabled,
    pinned: query.pinned,
    ...(type === 'activity' ? { activityStatus: query.activityStatus } : {}),
  }
}

export function createContentManagementStore(
  service: ContentManagementService,
  storeId = 'content-management',
) {
  return defineStore(storeId, () => {
    const activityRecords = ref<ContentRecord[]>([])
    const newsRecords = ref<ContentRecord[]>([])
    const bannerRecords = ref<BannerRecord[]>([])
    const priorityHintRecords = ref<PriorityHintRecord[]>([])
    const referencesByType = reactive<Record<ReferenceType, SelectableReference[]>>({
      activity: [], news: [], notice: [], 'traffic-control': [],
    })
    const activityQuery = reactive<ActivityQuery>({ ...DEFAULT_ACTIVITY_QUERY })
    const newsQuery = reactive<NewsQuery>({ ...DEFAULT_NEWS_QUERY })
    const bannerQuery = reactive<BannerQuery>({ ...DEFAULT_BANNER_QUERY })
    const hintQuery = reactive<PriorityHintQuery>({ ...DEFAULT_HINT_QUERY })
    const queries: TabQueries = { activity: activityQuery, news: newsQuery, banner: bannerQuery, hint: hintQuery }
    const defaults: TabQueries = { activity: DEFAULT_ACTIVITY_QUERY, news: DEFAULT_NEWS_QUERY, banner: DEFAULT_BANNER_QUERY, hint: DEFAULT_HINT_QUERY }
    const pages = reactive<Record<ContentManagementTab, number>>({ activity: 1, news: 1, banner: 1, hint: 1 })
    const totals = reactive<Record<ContentManagementTab, number>>({ activity: 0, news: 0, banner: 0, hint: 0 })
    const loadingTabs = reactive<Record<ContentManagementTab, boolean>>({ activity: false, news: false, banner: false, hint: false })
    const activeTab = ref<ContentManagementTab>('activity')
    const pageSize = ref(CONTENT_MANAGEMENT_PAGE_SIZE)
    const now = ref(Date.now())
    const isLoadingReferences = ref(false)
    const isLoading = computed(() => loadingTabs[activeTab.value] || isLoadingReferences.value)
    const isSaving = ref(false)
    const isExporting = ref(false)
    const detailLoadingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    const requestSequences: Record<ContentManagementTab, number> = { activity: 0, news: 0, banner: 0, hint: 0 }
    const tabErrors: Record<ContentManagementTab, string | null> = { activity: null, news: null, banner: null, hint: null }
    let pageSizeEpoch = 0
    let pendingPageSize: { value: number, epoch: number } | null = null
    let referencePromise: Promise<void> | null = null
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

    function queryForContentTab(tab: 'activity' | 'news', filters: ActivityQuery | NewsQuery = queries[tab]): ContentServerQuery {
      if (tab === 'activity') return contentServerQuery('activity', filters as ActivityQuery)
      const type = (filters as NewsQuery).type
      return contentServerQuery(type === 'all' ? ['news', 'notice'] : type, filters)
    }

    function requestPage<T extends ContentManagementTab>(tab: T, filters: TabQueries[T], page: number, size: number) {
      if (tab === 'activity' || tab === 'news') {
        return service.listContentPage(page, size, queryForContentTab(tab, filters as ActivityQuery | NewsQuery))
      }
      if (tab === 'banner') {
        const value = filters as BannerQuery
        return service.listBannerPage(page, size, { keyword: value.title, jumpType: value.jumpType, enabled: value.enabled })
      }
      const value = filters as PriorityHintQuery
      return service.listPriorityHintPage(page, size, { keyword: value.title, referenceType: value.referenceType, enabled: value.enabled })
    }

    async function loadPage<T extends ContentManagementTab>(tab: T, nextQuery: TabQueries[T], nextPage: number, nextSize = pendingPageSize?.value ?? pageSize.value): Promise<boolean> {
      const requestId = ++requestSequences[tab]
      const sizeEpoch = pageSizeEpoch
      const filters = { ...nextQuery, title: nextQuery.title.trim().normalize('NFKC') }
      const isCurrent = () => requestId === requestSequences[tab] && sizeEpoch === pageSizeEpoch
      loadingTabs[tab] = true
      tabErrors[tab] = null
      if (activeTab.value === tab) error.value = null
      try {
        let result = await requestPage(tab, filters, pendingPageSize ? 1 : nextPage, nextSize)
        if (!isCurrent()) return true
        const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize))
        if (result.page > lastPage) result = await requestPage(tab, filters, lastPage, nextSize)
        if (!isCurrent()) return true
        if (result.pageSize !== pageSize.value) {
          pageSize.value = result.pageSize
          // 共用每页条数改变后，其他页签在切入时重新请求第一页。
          for (const other of Object.keys(pages) as ContentManagementTab[]) {
            if (other !== tab) pages[other] = 1
          }
          activityRecords.value = []
          newsRecords.value = []
          bannerRecords.value = []
          priorityHintRecords.value = []
        }
        if (tab === 'activity') activityRecords.value = result.records as ContentRecord[]
        else if (tab === 'news') newsRecords.value = result.records as ContentRecord[]
        else if (tab === 'banner') bannerRecords.value = result.records as BannerRecord[]
        else priorityHintRecords.value = result.records as PriorityHintRecord[]
        totals[tab] = result.total
        pages[tab] = result.page
        Object.assign(queries[tab], filters)
        now.value = Date.now()
        return true
      }
      catch (cause) {
        if (!isCurrent()) return true
        tabErrors[tab] = errorMessage(cause)
        if (activeTab.value !== tab) return true
        error.value = tabErrors[tab]
        return false
      }
      finally {
        if (requestId === requestSequences[tab]) loadingTabs[tab] = false
      }
    }

    async function fetchReferences(): Promise<void> {
      if (referencePromise) return referencePromise
      isLoadingReferences.value = true
      referencePromise = Promise.all(REFERENCE_TYPES.map(type => service.listReferenceOptions(type)))
        .then(groups => { groups.forEach((records, index) => { referencesByType[REFERENCE_TYPES[index]!] = records }) })
        .finally(() => { isLoadingReferences.value = false; referencePromise = null })
      return referencePromise
    }

    async function loadTab(tab: ContentManagementTab): Promise<boolean> {
      activeTab.value = tab
      return loadPage(tab, queries[tab], pages[tab])
    }

    async function load(tab: ContentManagementTab = activeTab.value, filters?: TabQueries[ContentManagementTab]): Promise<boolean> {
      activeTab.value = tab
      const [listResult, referencesResult] = await Promise.allSettled([
        loadPage(tab, filters ?? queries[tab], filters ? 1 : pages[tab]),
        fetchReferences(),
      ])
      if (referencesResult.status === 'rejected') {
        error.value = errorMessage(referencesResult.reason)
        return false
      }
      return listResult.status === 'fulfilled' && listResult.value
    }

    async function setQuery<T extends ContentManagementTab>(tab: T, filters: TabQueries[T]): Promise<boolean> {
      activeTab.value = tab
      return loadPage(tab, filters, 1)
    }

    const setActivityQuery = (filters: ActivityQuery) => setQuery('activity', filters)
    const setNewsQuery = (filters: NewsQuery) => setQuery('news', filters)
    const setBannerQuery = (filters: BannerQuery) => setQuery('banner', filters)
    const setHintQuery = (filters: PriorityHintQuery) => setQuery('hint', filters)

    async function resetQuery(tab: ContentManagementTab): Promise<boolean> {
      return setQuery(tab, defaults[tab])
    }

    async function setPage(tab: ContentManagementTab, value: number): Promise<boolean> {
      if (!Number.isFinite(value)) return false
      activeTab.value = tab
      const lastPage = Math.max(1, Math.ceil(totals[tab] / pageSize.value))
      return loadPage(tab, queries[tab], Math.min(Math.max(1, Math.trunc(value)), lastPage))
    }

    async function setPageSize(value: number, tab: ContentManagementTab = activeTab.value): Promise<boolean> {
      if (!Number.isInteger(value) || value <= 0 || value > 100) return false
      activeTab.value = tab
      pageSizeEpoch += 1
      const pending = { value, epoch: pageSizeEpoch }
      pendingPageSize = pending
      try { return await loadPage(tab, queries[tab], 1, value) }
      finally { if (pendingPageSize === pending) pendingPageSize = null }
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

    async function mutate(operation: () => Promise<unknown>, tabs: readonly ContentManagementTab[], refreshReferences = false, firstPage = false): Promise<boolean> {
      isSaving.value = true
      error.value = null
      async function refreshData(): Promise<string | null> {
        const results = await Promise.allSettled([
          ...tabs.map(tab => loadPage(tab, queries[tab], firstPage ? 1 : pages[tab])),
          ...(refreshReferences ? [fetchReferences()] : []),
        ])
        for (const [index, result] of results.entries()) {
          if (result.status === 'rejected') return errorMessage(result.reason)
          if (result.value === false) return tabErrors[tabs[index]!] ?? '列表加载失败'
        }
        return null
      }
      try {
        await operation()
        const refreshError = await refreshData()
        if (refreshError) error.value = `操作已成功，但最新数据刷新失败：${refreshError}`
        return true
      }
      catch (cause) {
        await refreshData()
        error.value = errorMessage(cause)
        return false
      }
      finally { isSaving.value = false }
    }

    const createContent = (input: ContentWriteInput) => mutate(() => service.createContent(input), [input.type === 'activity' ? 'activity' : 'news'], true, true)
    const updateContent = (id: string, input: ContentWriteInput, previousPublication?: Pick<ContentRecord, 'publishStatus' | 'publishAt'>) => mutate(
      () => service.updateContent(id, input, previousPublication),
      [input.type === 'activity' ? 'activity' : 'news'],
      true,
    )
    const publishContent = (id: string, type: ContentRecord['type']) => mutate(() => service.publishContent(id), [type === 'activity' ? 'activity' : 'news'], true)
    const unpublishContent = (id: string, type: ContentRecord['type']) => mutate(() => service.unpublishContent(id), [type === 'activity' ? 'activity' : 'news'], true)
    const setContentPinned = (id: string, pinned: boolean, type: ContentRecord['type']) => mutate(() => service.setContentPinned(id, pinned), [type === 'activity' ? 'activity' : 'news'])
    const setContentEnabled = (id: string, enabled: boolean, type: ContentRecord['type']) => mutate(() => service.setContentEnabled(id, enabled), [type === 'activity' ? 'activity' : 'news'], true)
    const removeContent = (id: string, type: ContentRecord['type']) => mutate(() => service.removeContent(id), [type === 'activity' ? 'activity' : 'news'], true)
    const createBanner = (input: BannerWriteInput) => mutate(() => service.createBanner(input), ['banner'], false, true)
    const updateBanner = (id: string, input: BannerWriteInput) => mutate(() => service.updateBanner(id, input), ['banner'])
    const setBannerEnabled = (id: string, enabled: boolean) => mutate(() => service.setBannerEnabled(id, enabled), ['banner'])
    const removeBanner = (id: string) => mutate(() => service.removeBanner(id), ['banner'])
    const createPriorityHint = (input: PriorityHintWriteInput) => mutate(() => service.createPriorityHint(input), ['hint'], false, true)
    const updatePriorityHint = (id: string, input: PriorityHintWriteInput) => mutate(() => service.updatePriorityHint(id, input), ['hint'])
    const setPriorityHintEnabled = (id: string, enabled: boolean) => mutate(() => service.setPriorityHintEnabled(id, enabled), ['hint'])
    const removePriorityHint = (id: string) => mutate(() => service.removePriorityHint(id), ['hint'])

    async function exportContents(tab: 'activity' | 'news'): Promise<ContentExportFile | null> {
      isExporting.value = true
      error.value = null
      try { return await service.exportContents(queryForContentTab(tab)) }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { isExporting.value = false }
    }

    async function refreshTemporalState(tab: ContentManagementTab = activeTab.value): Promise<boolean> {
      now.value = Date.now()
      if ((tab !== 'activity' && tab !== 'news') || isLoading.value || isSaving.value) return true
      return loadTab(tab)
    }

    function resetError(): void { error.value = null }

    return {
      referencesByType,
      activityQuery,
      newsQuery,
      bannerQuery,
      hintQuery,
      pages,
      totals,
      pageSize,
      now,
      isLoading,
      isSaving,
      isExporting,
      detailLoadingId,
      error,
      activityRecords,
      newsRecords,
      bannerRecords,
      priorityHintRecords,
      selectableReferences,
      targetIsValid,
      isBannerEffective: bannerIsEffective,
      isPriorityHintEffective: priorityHintIsEffective,
      setPage,
      setPageSize,
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
