import type {
  ContactNumber,
  ContactNumberWriteInput,
  FeedbackHandleInput,
  FeedbackQuery,
  UserFeedback,
  UserServiceActor,
  UserServiceService,
  UserServiceSnapshot,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { userServiceService, validateContactNumberInput, validateFeedbackHandleInput } from '../services/user-service-service'

export const USER_SERVICE_PAGE_SIZE = 20

export const DEFAULT_FEEDBACK_QUERY: FeedbackQuery = {
  type: 'all',
  status: 'all',
  startDate: '',
  endDate: '',
}

function emptySnapshot(): UserServiceSnapshot {
  return { feedbacks: [], contacts: [], auditLogs: [] }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export function toShanghaiDateKey(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function validateFeedbackQuery(query: FeedbackQuery): string | null {
  if (query.startDate && query.endDate && query.startDate > query.endDate) return '开始日期不能晚于结束日期'
  return null
}

function sortContacts(records: readonly ContactNumber[]): ContactNumber[] {
  return [...records].sort((first, second) => first.sort - second.sort || first.createdAt.localeCompare(second.createdAt))
}

function sortFeedbacks(records: readonly UserFeedback[]): UserFeedback[] {
  return [...records].sort((first, second) => second.submittedAt.localeCompare(first.submittedAt))
}

export function createUserServiceStore(service: UserServiceService, storeId = 'user-service-management') {
  return defineStore(storeId, () => {
    const snapshot = ref<UserServiceSnapshot>(emptySnapshot())
    const query = reactive<FeedbackQuery>({ ...DEFAULT_FEEDBACK_QUERY })
    const page = ref(1)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    const queryError = ref<string | null>(null)

    const filteredFeedbacks = computed(() => sortFeedbacks(snapshot.value.feedbacks.filter((item) => {
      if (query.type !== 'all' && item.type !== query.type) return false
      if (query.status !== 'all' && item.status !== query.status) return false
      const dateKey = toShanghaiDateKey(item.submittedAt)
      if (query.startDate && dateKey < query.startDate) return false
      if (query.endDate && dateKey > query.endDate) return false
      return true
    })))
    const total = computed(() => filteredFeedbacks.value.length)
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / USER_SERVICE_PAGE_SIZE)))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const paginatedFeedbacks = computed(() => {
      const start = (currentPage.value - 1) * USER_SERVICE_PAGE_SIZE
      return filteredFeedbacks.value.slice(start, start + USER_SERVICE_PAGE_SIZE)
    })
    const contacts = computed(() => sortContacts(snapshot.value.contacts))
    const pendingCount = computed(() => snapshot.value.feedbacks.filter((item) => item.status === 'pending').length)

    function setQuery(next: FeedbackQuery): boolean {
      const validation = validateFeedbackQuery(next)
      queryError.value = validation
      if (validation) return false
      Object.assign(query, next)
      page.value = 1
      return true
    }

    function resetQuery(): void {
      Object.assign(query, DEFAULT_FEEDBACK_QUERY)
      queryError.value = null
      page.value = 1
    }

    function setPage(next: number): void {
      if (!Number.isFinite(next)) return
      page.value = Math.min(Math.max(Math.trunc(next), 1), pageCount.value)
    }

    function validateHandle(input: FeedbackHandleInput) {
      return validateFeedbackHandleInput(input)
    }

    function validateContact(input: ContactNumberWriteInput) {
      return validateContactNumberInput(input)
    }

    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        snapshot.value = await service.load()
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        isLoading.value = false
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
        snapshot.value.feedbacks = sortFeedbacks([
          ...snapshot.value.feedbacks.filter((item) => item.id !== id),
          feedback,
        ])
        snapshot.value.auditLogs = await service.listAuditLogs()
        return feedback
      } catch (cause) {
        error.value = errorMessage(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function createContact(
      input: ContactNumberWriteInput,
      actor: UserServiceActor,
    ): Promise<ContactNumber | null> {
      const issues = validateContact(input)
      if (issues.length) {
        error.value = issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const contact = await service.createContact(input, actor)
        snapshot.value.contacts = sortContacts([...snapshot.value.contacts, contact])
        snapshot.value.auditLogs = await service.listAuditLogs()
        return contact
      } catch (cause) {
        error.value = errorMessage(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function updateContact(
      id: string,
      input: ContactNumberWriteInput,
      actor: UserServiceActor,
    ): Promise<ContactNumber | null> {
      const issues = validateContact(input)
      if (issues.length) {
        error.value = issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const contact = await service.updateContact(id, input, actor)
        snapshot.value.contacts = sortContacts([
          ...snapshot.value.contacts.filter((item) => item.id !== id),
          contact,
        ])
        snapshot.value.auditLogs = await service.listAuditLogs()
        return contact
      } catch (cause) {
        error.value = errorMessage(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function removeContact(id: string, actor: UserServiceActor): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        await service.removeContact(id, actor)
        snapshot.value.contacts = snapshot.value.contacts.filter((item) => item.id !== id)
        snapshot.value.auditLogs = await service.listAuditLogs()
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        deletingId.value = null
      }
    }

    function resetError(): void {
      error.value = null
      queryError.value = null
    }

    return {
      snapshot,
      query,
      page,
      isLoading,
      isSaving,
      deletingId,
      error,
      queryError,
      filteredFeedbacks,
      total,
      pageCount,
      currentPage,
      paginatedFeedbacks,
      contacts,
      pendingCount,
      setQuery,
      resetQuery,
      setPage,
      validateHandle,
      validateContact,
      load,
      handleFeedback,
      createContact,
      updateContact,
      removeContact,
      resetError,
    }
  })
}

export const useUserServiceStore = createUserServiceStore(userServiceService)
