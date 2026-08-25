import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ActivityQuery,
  BannerQuery,
  BannerWriteInput,
  ContentManagementService,
  ContentManagementSnapshot,
  ContentManagementTab,
  ContentWriteInput,
  ExternalContentReference,
  ExternalContentReferenceService,
  NewsQuery,
  PriorityHintQuery,
  PriorityHintWriteInput,
} from '../types'
import {
  buildSelectableReferences,
  contentManagementService,
  externalContentReferenceService,
  getActivityStatus,
  isBannerEffective,
  isPriorityHintEffective,
  sortBanners,
  sortContents,
  sortPriorityHints,
} from '../services/content-management-service'

export const CONTENT_MANAGEMENT_PAGE_SIZE = 20

export const DEFAULT_ACTIVITY_QUERY: ActivityQuery = {
  publishStatus: 'all',
  activityStatus: 'all',
  pinned: 'all',
  enabled: 'all',
  title: '',
}

export const DEFAULT_NEWS_QUERY: NewsQuery = {
  type: 'all',
  publishStatus: 'all',
  pinned: 'all',
  enabled: 'all',
  title: '',
}

export const DEFAULT_BANNER_QUERY: BannerQuery = {
  jumpType: 'all',
  enabled: 'all',
  title: '',
}

export const DEFAULT_HINT_QUERY: PriorityHintQuery = {
  referenceType: 'all',
  enabled: 'all',
  title: '',
}

function normalizedIncludes(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN'))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function emptySnapshot(): ContentManagementSnapshot {
  return {
    contents: [],
    banners: [],
    priorityHints: [],
  }
}

export function createContentManagementStore(
  service: ContentManagementService,
  referenceService: ExternalContentReferenceService,
  storeId = 'content-management',
) {
  return defineStore(storeId, () => {
    const snapshot = ref<ContentManagementSnapshot>(emptySnapshot())
    const trafficReferences = ref<ExternalContentReference[]>([])
    const activityQuery = reactive<ActivityQuery>({ ...DEFAULT_ACTIVITY_QUERY })
    const newsQuery = reactive<NewsQuery>({ ...DEFAULT_NEWS_QUERY })
    const bannerQuery = reactive<BannerQuery>({ ...DEFAULT_BANNER_QUERY })
    const hintQuery = reactive<PriorityHintQuery>({ ...DEFAULT_HINT_QUERY })
    const pages = reactive<Record<ContentManagementTab, number>>({ activity: 1, news: 1, banner: 1, hint: 1 })
    const now = ref(Date.now())
    const isLoading = ref(false)
    const isSaving = ref(false)
    const error = ref<string | null>(null)

    const activityRecords = computed(() => sortContents(snapshot.value.contents.filter((record) => {
      if (record.type !== 'activity') return false
      if (activityQuery.publishStatus !== 'all' && record.publishStatus !== activityQuery.publishStatus) return false
      if (activityQuery.activityStatus !== 'all' && getActivityStatus(record, new Date(now.value)) !== activityQuery.activityStatus) return false
      if (activityQuery.pinned === 'pinned' && !record.pinned) return false
      if (activityQuery.pinned === 'not-pinned' && record.pinned) return false
      if (activityQuery.enabled === 'enabled' && !record.enabled) return false
      if (activityQuery.enabled === 'disabled' && record.enabled) return false
      return !activityQuery.title.trim() || normalizedIncludes(record.title, activityQuery.title)
    })))

    const newsRecords = computed(() => sortContents(snapshot.value.contents.filter((record) => {
      if (record.type === 'activity') return false
      if (newsQuery.type !== 'all' && record.type !== newsQuery.type) return false
      if (newsQuery.publishStatus !== 'all' && record.publishStatus !== newsQuery.publishStatus) return false
      if (newsQuery.pinned === 'pinned' && !record.pinned) return false
      if (newsQuery.pinned === 'not-pinned' && record.pinned) return false
      if (newsQuery.enabled === 'enabled' && !record.enabled) return false
      if (newsQuery.enabled === 'disabled' && record.enabled) return false
      return !newsQuery.title.trim() || normalizedIncludes(record.title, newsQuery.title)
    })))

    const bannerRecords = computed(() => sortBanners(snapshot.value.banners.filter((record) => {
      if (bannerQuery.jumpType !== 'all' && record.jumpType !== bannerQuery.jumpType) return false
      if (bannerQuery.enabled === 'enabled' && !record.displayEnabled) return false
      if (bannerQuery.enabled === 'disabled' && record.displayEnabled) return false
      return !bannerQuery.title.trim() || normalizedIncludes(record.title, bannerQuery.title)
    })))

    const priorityHintRecords = computed(() => sortPriorityHints(snapshot.value.priorityHints.filter((record) => {
      if (hintQuery.referenceType !== 'all' && record.referenceType !== hintQuery.referenceType) return false
      if (hintQuery.enabled === 'enabled' && !record.displayEnabled) return false
      if (hintQuery.enabled === 'disabled' && record.displayEnabled) return false
      return !hintQuery.title.trim() || normalizedIncludes(record.title, hintQuery.title)
    })))

    function paginated<T>(records: readonly T[], tab: ContentManagementTab): T[] {
      const maxPage = Math.max(1, Math.ceil(records.length / CONTENT_MANAGEMENT_PAGE_SIZE))
      const page = Math.min(Math.max(pages[tab], 1), maxPage)
      const start = (page - 1) * CONTENT_MANAGEMENT_PAGE_SIZE
      return records.slice(start, start + CONTENT_MANAGEMENT_PAGE_SIZE)
    }

    const paginatedActivities = computed(() => paginated(activityRecords.value, 'activity'))
    const paginatedNews = computed(() => paginated(newsRecords.value, 'news'))
    const paginatedBanners = computed(() => paginated(bannerRecords.value, 'banner'))
    const paginatedPriorityHints = computed(() => paginated(priorityHintRecords.value, 'hint'))
    const selectableReferences = computed(() => buildSelectableReferences(snapshot.value, trafficReferences.value))
    function targetIsValid(targetId: string | null): boolean {
      return Boolean(targetId && selectableReferences.value.some((reference) => reference.id === targetId && reference.valid))
    }
    function bannerIsEffective(record: Parameters<typeof isBannerEffective>[0]): boolean {
      return isBannerEffective(record, new Date(now.value)) && (record.jumpType === 'none' || targetIsValid(record.targetId))
    }
    function priorityHintIsEffective(record: Parameters<typeof isPriorityHintEffective>[0]): boolean {
      return isPriorityHintEffective(record, new Date(now.value)) && targetIsValid(record.targetId)
    }
    const activePriorityHintIds = computed(() => sortPriorityHints(snapshot.value.priorityHints)
      .filter(priorityHintIsEffective)
      .slice(0, 2)
      .map((record) => record.id))

    function setPage(tab: ContentManagementTab, page: number): void {
      if (!Number.isFinite(page)) return
      pages[tab] = Math.max(1, Math.trunc(page))
    }

    function setActivityQuery(query: ActivityQuery): void {
      Object.assign(activityQuery, query)
      pages.activity = 1
    }

    function setNewsQuery(query: NewsQuery): void {
      Object.assign(newsQuery, query)
      pages.news = 1
    }

    function setBannerQuery(query: BannerQuery): void {
      Object.assign(bannerQuery, query)
      pages.banner = 1
    }

    function setHintQuery(query: PriorityHintQuery): void {
      Object.assign(hintQuery, query)
      pages.hint = 1
    }

    function resetQuery(tab: ContentManagementTab): void {
      if (tab === 'activity') Object.assign(activityQuery, DEFAULT_ACTIVITY_QUERY)
      if (tab === 'news') Object.assign(newsQuery, DEFAULT_NEWS_QUERY)
      if (tab === 'banner') Object.assign(bannerQuery, DEFAULT_BANNER_QUERY)
      if (tab === 'hint') Object.assign(hintQuery, DEFAULT_HINT_QUERY)
      pages[tab] = 1
    }

    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        const [nextSnapshot, references] = await Promise.all([
          service.load(),
          referenceService.listTrafficControls(),
        ])
        snapshot.value = nextSnapshot
        trafficReferences.value = references
        now.value = Date.now()
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        isLoading.value = false
      }
    }

    async function refreshTemporalState(): Promise<void> {
      now.value = Date.now()
      try {
        snapshot.value = await service.load()
      } catch {
        // Keep the last usable snapshot; a visible reload action handles persistent failures.
      }
    }

    async function mutate(operation: () => Promise<unknown>): Promise<boolean> {
      isSaving.value = true
      error.value = null
      try {
        await operation()
        snapshot.value = await service.load()
        now.value = Date.now()
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        isSaving.value = false
      }
    }

    const createContent = (input: ContentWriteInput) => mutate(() => service.createContent(input))
    const updateContent = (id: string, input: ContentWriteInput) => mutate(() => service.updateContent(id, input))
    const publishContent = (id: string) => mutate(() => service.publishContent(id))
    const setContentPinned = (id: string, pinned: boolean) => mutate(() => service.setContentPinned(id, pinned))
    const setContentEnabled = (id: string, enabled: boolean) => mutate(() => service.setContentEnabled(id, enabled))
    const removeContent = (id: string) => mutate(() => service.removeContent(id))
    const getDeleteReferenceBlock = (id: string) => service.getDeleteReferenceBlock(id)
    const createBanner = (input: BannerWriteInput) => mutate(() => service.createBanner(input))
    const updateBanner = (id: string, input: BannerWriteInput) => mutate(() => service.updateBanner(id, input))
    const setBannerEnabled = (id: string, enabled: boolean) => mutate(() => service.setBannerEnabled(id, enabled))
    const removeBanner = (id: string) => mutate(() => service.removeBanner(id))
    const createPriorityHint = (input: PriorityHintWriteInput) => mutate(() => service.createPriorityHint(input))
    const updatePriorityHint = (id: string, input: PriorityHintWriteInput) => mutate(() => service.updatePriorityHint(id, input))
    const setPriorityHintEnabled = (id: string, enabled: boolean) => mutate(() => service.setPriorityHintEnabled(id, enabled))
    const removePriorityHint = (id: string) => mutate(() => service.removePriorityHint(id))

    function resetError(): void {
      error.value = null
    }

    return {
      snapshot,
      trafficReferences,
      activityQuery,
      newsQuery,
      bannerQuery,
      hintQuery,
      pages,
      now,
      isLoading,
      isSaving,
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
      refreshTemporalState,
      createContent,
      updateContent,
      publishContent,
      setContentPinned,
      setContentEnabled,
      removeContent,
      getDeleteReferenceBlock,
      createBanner,
      updateBanner,
      setBannerEnabled,
      removeBanner,
      createPriorityHint,
      updatePriorityHint,
      setPriorityHintEnabled,
      removePriorityHint,
      resetError,
    }
  })
}

export const useContentManagementStore = createContentManagementStore(
  contentManagementService,
  externalContentReferenceService,
)
