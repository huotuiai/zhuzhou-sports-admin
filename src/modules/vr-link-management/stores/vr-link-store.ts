import type {
  VrLink,
  VrLinkPage,
  VrLinkQuery,
  VrLinkService,
  VrLinkStatus,
  VrLinkValidationResult,
  VrLinkWriteInput,
  VrPlaceOption,
  VrPlaceType,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  sanitizeVrLinkInput,
  validateVrLinkInput,
  vrLinkService,
} from '../services/vr-link-service'

const PAGE_SIZE = 20

export const DEFAULT_VR_LINK_QUERY: Readonly<VrLinkQuery> = {
  keyword: '',
  placeType: 'all',
  status: 'all',
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function normalizeQuery(query: VrLinkQuery): VrLinkQuery {
  return {
    keyword: query.keyword.trim().normalize('NFKC'),
    placeType: query.placeType,
    status: query.status,
  }
}

function clonePlaceOption(option: VrPlaceOption): VrPlaceOption {
  return { ...option }
}

export function createVrLinkStore(service: VrLinkService, storeId = 'vr-link') {
  return defineStore(storeId, () => {
    const records = ref<VrLink[]>([])
    const query = reactive<VrLinkQuery>({ ...DEFAULT_VR_LINK_QUERY })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const total = ref(0)
    const placeOptions = ref<VrPlaceOption[]>([])
    const placeOptionsType = ref<VrPlaceType | null>(null)
    const isLoading = ref(false)
    const isPlaceOptionsLoading = ref(false)
    const isSaving = ref(false)
    const detailLoadingId = ref<string | null>(null)
    const updatingStatusId = ref<string | null>(null)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    const placeOptionsError = ref<string | null>(null)
    let placeOptionsRequestId = 0

    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, pageSize.value))))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))

    function applyPage(result: VrLinkPage): void {
      records.value = result.records
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
    }

    async function loadPage(nextPage = page.value): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        applyPage(await service.listPage(nextPage, pageSize.value, normalizeQuery(query)))
        return true
      }
      catch (cause) {
        error.value = message(cause)
        return false
      }
      finally {
        isLoading.value = false
      }
    }

    async function load(): Promise<boolean> {
      return loadPage(page.value)
    }

    async function setQuery(patch: Partial<VrLinkQuery>): Promise<boolean> {
      Object.assign(query, normalizeQuery({ ...query, ...patch }))
      page.value = 1
      return loadPage(1)
    }

    async function resetQuery(): Promise<boolean> {
      Object.assign(query, DEFAULT_VR_LINK_QUERY)
      page.value = 1
      return loadPage(1)
    }

    async function setPage(value: number): Promise<boolean> {
      if (!Number.isFinite(value)) return false
      const nextPage = Math.min(Math.max(Math.trunc(value), 1), pageCount.value)
      if (nextPage === page.value) return true
      return loadPage(nextPage)
    }

    async function setPageSize(value: number): Promise<boolean> {
      if (!Number.isInteger(value) || value <= 0) return false
      pageSize.value = value
      page.value = 1
      return loadPage(1)
    }

    async function loadPlaceOptions(placeType: VrPlaceType): Promise<boolean> {
      const requestId = ++placeOptionsRequestId
      placeOptionsType.value = placeType
      placeOptions.value = []
      placeOptionsError.value = null
      isPlaceOptionsLoading.value = true
      try {
        const options = await service.listPlaceOptions(placeType)
        if (requestId === placeOptionsRequestId) {
          placeOptions.value = options.map(clonePlaceOption)
        }
        return requestId === placeOptionsRequestId
      }
      catch (cause) {
        if (requestId === placeOptionsRequestId) placeOptionsError.value = message(cause)
        return false
      }
      finally {
        if (requestId === placeOptionsRequestId) isPlaceOptionsLoading.value = false
      }
    }

    function validate(input: VrLinkWriteInput): VrLinkValidationResult {
      return validateVrLinkInput(input)
    }

    async function get(id: string): Promise<VrLink | null> {
      detailLoadingId.value = id
      error.value = null
      try {
        return await service.get(id)
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        detailLoadingId.value = null
      }
    }

    async function refreshAfterMutation(targetPage = page.value): Promise<void> {
      try {
        applyPage(await service.listPage(targetPage, pageSize.value, normalizeQuery(query)))
      }
      catch (cause) {
        error.value = `操作已成功，但最新列表刷新失败：${message(cause)}`
      }
    }

    async function create(input: VrLinkWriteInput): Promise<VrLink | null> {
      const validation = validate(input)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.create(sanitizeVrLinkInput(input))
        page.value = 1
        await refreshAfterMutation(1)
        return record
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function update(id: string, input: VrLinkWriteInput): Promise<VrLink | null> {
      const validation = validate(input)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.update(id, sanitizeVrLinkInput(input))
        await refreshAfterMutation()
        return record
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function updateStatus(id: string, status: VrLinkStatus): Promise<VrLink | null> {
      updatingStatusId.value = id
      error.value = null
      try {
        const record = await service.updateStatus(id, status)
        await refreshAfterMutation()
        return record
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        updatingStatusId.value = null
      }
    }

    async function remove(id: string): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        await service.remove(id)
        const targetPage = records.value.length === 1 && page.value > 1 ? page.value - 1 : page.value
        await refreshAfterMutation(targetPage)
        return true
      }
      catch (cause) {
        error.value = message(cause)
        return false
      }
      finally {
        deletingId.value = null
      }
    }

    function resetError(): void {
      error.value = null
      placeOptionsError.value = null
    }

    return {
      records,
      query,
      page,
      pageSize,
      total,
      placeOptions,
      placeOptionsType,
      isLoading,
      isPlaceOptionsLoading,
      isSaving,
      detailLoadingId,
      updatingStatusId,
      deletingId,
      error,
      placeOptionsError,
      pageCount,
      currentPage,
      load,
      loadPage,
      setQuery,
      resetQuery,
      setPage,
      setPageSize,
      loadPlaceOptions,
      validate,
      get,
      create,
      update,
      updateStatus,
      remove,
      resetError,
    }
  })
}

export const useVrLinkStore = createVrLinkStore(vrLinkService)
