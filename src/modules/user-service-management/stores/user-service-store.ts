import type {
  ContactNumber,
  ContactNumberWriteInput,
  FeedbackExportFile,
  FeedbackHandleInput,
  FeedbackQuery,
  UserFeedback,
  UserServiceService,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { userServiceService } from '../services/user-service-service'
import { validateContactNumberInput, validateFeedbackHandleInput } from '../services/user-service-validation'

export const USER_SERVICE_PAGE_SIZE = 20

export const DEFAULT_FEEDBACK_QUERY: Readonly<FeedbackQuery> = {
  type: 'all',
  status: 'all',
  startDate: '',
  endDate: '',
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function sortContacts(records: readonly ContactNumber[]): ContactNumber[] {
  return [...records].sort((first, second) => first.sort - second.sort || first.createdAt.localeCompare(second.createdAt))
}

export function validateFeedbackQuery(query: FeedbackQuery): string | null {
  if (query.startDate && query.endDate && query.startDate > query.endDate) return '开始日期不能晚于结束日期'
  return null
}

export function createUserServiceStore(service: UserServiceService, storeId = 'user-service-management') {
  return defineStore(storeId, () => {
    const feedbacks = ref<UserFeedback[]>([])
    const contacts = ref<ContactNumber[]>([])
    const query = reactive<FeedbackQuery>({ ...DEFAULT_FEEDBACK_QUERY })
    const page = ref(1)
    const pageSize = ref(USER_SERVICE_PAGE_SIZE)
    const total = ref(0)
    const overallTotal = ref(0)
    const pendingCount = ref(0)
    const initialized = ref(false)
    const isFeedbackLoading = ref(false)
    const isContactsLoading = ref(false)
    const isSaving = ref(false)
    const isExporting = ref(false)
    const deletingId = ref<string | null>(null)
    const detailLoadingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    const queryError = ref<string | null>(null)
    let initializePromise: Promise<boolean> | null = null

    const processedCount = computed(() => Math.max(0, overallTotal.value - pendingCount.value))
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const isLoading = computed(() => isFeedbackLoading.value || isContactsLoading.value)

    function applyFeedbackPage(result: Awaited<ReturnType<UserServiceService['listFeedbacks']>>): void {
      feedbacks.value = result.feedbacks
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
    }

    function sameFeedbackQuery(first: FeedbackQuery, second: FeedbackQuery): boolean {
      return first.type === second.type
        && first.status === second.status
        && first.startDate === second.startDate
        && first.endDate === second.endDate
    }

    async function loadFeedbackPage(nextQuery: FeedbackQuery, nextPage: number): Promise<boolean> {
      isFeedbackLoading.value = true
      error.value = null
      try {
        applyFeedbackPage(await service.listFeedbacks(nextQuery, nextPage, pageSize.value))
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isFeedbackLoading.value = false
      }
    }

    async function loadValidFeedbackPage(nextQuery: FeedbackQuery, nextPage: number): Promise<boolean> {
      const loaded = await loadFeedbackPage(nextQuery, nextPage)
      if (!loaded) return false
      const validPage = Math.min(page.value, pageCount.value)
      return validPage === page.value ? true : loadFeedbackPage(nextQuery, validPage)
    }

    async function refreshOverview(): Promise<boolean> {
      try {
        const [all, pending] = await Promise.all([
          service.listFeedbacks({ ...DEFAULT_FEEDBACK_QUERY }, 1, 1),
          service.listFeedbacks({ ...DEFAULT_FEEDBACK_QUERY, status: 'pending' }, 1, 1),
        ])
        overallTotal.value = all.total
        pendingCount.value = pending.total
        return true
      }
      catch {
        return false
      }
    }

    async function loadContacts(): Promise<boolean> {
      isContactsLoading.value = true
      error.value = null
      try {
        contacts.value = sortContacts(await service.listContacts())
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isContactsLoading.value = false
      }
    }

    async function refresh(nextQuery: FeedbackQuery = { ...query }): Promise<boolean> {
      if (initializePromise) return initializePromise
      const validation = validateFeedbackQuery(nextQuery)
      queryError.value = validation
      if (validation) return false
      const targetPage = sameFeedbackQuery(nextQuery, query) ? page.value : 1
      initializePromise = Promise.all([
        loadValidFeedbackPage(nextQuery, targetPage),
        loadContacts(),
        refreshOverview(),
      ]).then(([feedbackLoaded, contactsLoaded, overviewLoaded]) => {
        if (feedbackLoaded) Object.assign(query, nextQuery)
        if (!overviewLoaded && !error.value) error.value = '反馈统计加载失败，请稍后重试'
        initialized.value = feedbackLoaded && contactsLoaded && overviewLoaded
        return initialized.value
      }).finally(() => {
        initializePromise = null
      })
      return initializePromise
    }

    async function initialize(initialQuery: FeedbackQuery = { ...query }, force = false): Promise<boolean> {
      if (initialized.value && !force) return true
      return refresh(initialQuery)
    }

    async function queryFeedbacks(nextQuery: FeedbackQuery): Promise<boolean> {
      const validation = validateFeedbackQuery(nextQuery)
      queryError.value = validation
      if (validation) return false
      const loaded = await loadFeedbackPage(nextQuery, 1)
      if (loaded) Object.assign(query, nextQuery)
      return loaded
    }

    async function resetQuery(): Promise<boolean> {
      const loaded = await queryFeedbacks({ ...DEFAULT_FEEDBACK_QUERY })
      if (loaded) queryError.value = null
      return loaded
    }

    async function changePage(nextPage: number): Promise<boolean> {
      const normalized = Number.isFinite(nextPage) ? Math.trunc(nextPage) : 1
      const target = Math.min(Math.max(normalized, 1), pageCount.value)
      return loadFeedbackPage({ ...query }, target)
    }

    function validateHandle(input: FeedbackHandleInput) {
      return validateFeedbackHandleInput(input)
    }

    function validateContact(input: ContactNumberWriteInput) {
      return validateContactNumberInput(input)
    }

    async function getFeedback(id: string): Promise<UserFeedback | null> {
      detailLoadingId.value = id
      error.value = null
      try {
        return await service.getFeedback(id)
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        detailLoadingId.value = null
      }
    }

    async function refreshFeedbackAfterMutation(): Promise<void> {
      const loaded = await loadFeedbackPage({ ...query }, page.value)
      if (loaded && feedbacks.value.length === 0 && page.value > 1) {
        await loadFeedbackPage({ ...query }, page.value - 1)
      }
    }

    async function handleFeedback(id: string, input: FeedbackHandleInput): Promise<UserFeedback | null> {
      const issues = validateHandle(input)
      if (issues.length) {
        error.value = issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const feedback = await service.handleFeedback(id, input)
        feedbacks.value = feedbacks.value.map(item => item.id === feedback.id ? feedback : item)
        await refreshFeedbackAfterMutation()
        await refreshOverview()
        return feedback
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function exportFeedbacks(): Promise<FeedbackExportFile | null> {
      if (isExporting.value) return null
      isExporting.value = true
      error.value = null
      try {
        return await service.exportFeedbacks({ ...query })
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        isExporting.value = false
      }
    }

    async function createContact(input: ContactNumberWriteInput): Promise<ContactNumber | null> {
      const issues = validateContact(input)
      if (issues.length) {
        error.value = issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const contact = await service.createContact(input)
        contacts.value = sortContacts([...contacts.value, contact])
        return contact
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function updateContact(id: string, input: ContactNumberWriteInput): Promise<ContactNumber | null> {
      const issues = validateContact(input)
      if (issues.length) {
        error.value = issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const contact = await service.updateContact(id, input)
        contacts.value = sortContacts([...contacts.value.filter(item => item.id !== id), contact])
        return contact
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function deleteContact(id: string): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        await service.deleteContact(id)
        contacts.value = contacts.value.filter(item => item.id !== id)
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        deletingId.value = null
      }
    }

    function resetError(): void {
      error.value = null
      queryError.value = null
    }

    return {
      feedbacks,
      contacts,
      query,
      page,
      pageSize,
      total,
      overallTotal,
      pendingCount,
      processedCount,
      pageCount,
      currentPage,
      initialized,
      isLoading,
      isFeedbackLoading,
      isContactsLoading,
      isSaving,
      isExporting,
      deletingId,
      detailLoadingId,
      error,
      queryError,
      initialize,
      refresh,
      queryFeedbacks,
      resetQuery,
      changePage,
      refreshOverview,
      getFeedback,
      handleFeedback,
      exportFeedbacks,
      loadContacts,
      createContact,
      updateContact,
      deleteContact,
      validateHandle,
      validateContact,
      resetError,
    }
  })
}

export const useUserServiceStore = createUserServiceStore(userServiceService)
