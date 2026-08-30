import type {
  ParkingLot,
  ParkingLotCreateInput,
  ParkingLotCreateOptions,
  ParkingLotDetail,
  ParkingLotPage,
  ParkingLotQuery,
  ParkingLotService,
  ParkingLotUpdateInput,
  ParkingLotUpdateOptions,
  ParkingLotValidationResult,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  parkingLotService,
  sanitizeParkingLotBaseInput,
  sanitizeParkingLotCreateInput,
  validateParkingLotBaseInput,
  validateParkingLotCreateInput,
} from '../services/parking-lot-service'

const PAGE_SIZE = 20

const DEFAULT_QUERY: ParkingLotQuery = {
  keyword: '',
  feeType: 'all',
  openStatus: 'all',
  availabilityUpdateMethod: 'all',
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function normalizeQuery(value: ParkingLotQuery): ParkingLotQuery {
  return {
    keyword: value.keyword.trim().normalize('NFKC'),
    feeType: value.feeType,
    openStatus: value.openStatus,
    availabilityUpdateMethod: value.availabilityUpdateMethod,
  }
}

export function createParkingLotStore(service: ParkingLotService, storeId = 'parking-lot') {
  return defineStore(storeId, () => {
    const records = ref<ParkingLot[]>([])
    const mapRecords = ref<ParkingLot[]>([])
    const query = reactive<ParkingLotQuery>({ ...DEFAULT_QUERY })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const total = ref(0)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const detailLoadingId = ref<string | null>(null)
    const updatingAvailabilityId = ref<string | null>(null)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, pageSize.value))))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const filteredRecords = computed(() => records.value)
    const paginatedRecords = computed(() => records.value)

    function applyPage(result: ParkingLotPage): void {
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
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isLoading.value = false
      }
    }

    async function load(): Promise<boolean> {
      return loadPage(page.value)
    }

    async function loadMap(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        mapRecords.value = await service.list(normalizeQuery(query))
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isLoading.value = false
      }
    }

    async function setQuery(patch: Partial<ParkingLotQuery>): Promise<boolean> {
      Object.assign(query, normalizeQuery({ ...query, ...patch }))
      page.value = 1
      return loadPage(1)
    }

    async function resetQuery(): Promise<boolean> {
      Object.assign(query, DEFAULT_QUERY)
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

    function validateCreate(input: ParkingLotCreateInput): ParkingLotValidationResult {
      return validateParkingLotCreateInput(input, records.value)
    }

    function validateUpdate(input: ParkingLotUpdateInput): ParkingLotValidationResult {
      return validateParkingLotBaseInput(input)
    }

    function replaceRecord(record: ParkingLot): void {
      const index = records.value.findIndex(item => item.id === record.id)
      if (index < 0) return
      const next = [...records.value]
      next[index] = record
      records.value = next
    }

    async function get(id: string): Promise<ParkingLotDetail | null> {
      detailLoadingId.value = id
      error.value = null
      try {
        const detail = await service.get(id)
        replaceRecord(detail.record)
        return detail
      }
      catch (cause) {
        error.value = errorMessage(cause)
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
        error.value = `操作已成功，但最新列表刷新失败：${errorMessage(cause)}`
      }
    }

    async function create(input: ParkingLotCreateInput, options?: ParkingLotCreateOptions): Promise<ParkingLot | null> {
      const validation = validateCreate(input)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.create(sanitizeParkingLotCreateInput(input), options)
        page.value = 1
        await refreshAfterMutation(1)
        return record
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function updateEnabled(id: string, enabled: boolean): Promise<ParkingLot | null> {
      isSaving.value = true
      error.value = null
      try {
        const record = await service.updateEnabled(id, enabled)
        await refreshAfterMutation()
        return record
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function update(
      id: string,
      input: ParkingLotUpdateInput,
      options?: ParkingLotUpdateOptions,
    ): Promise<ParkingLot | null> {
      const validation = validateUpdate(input)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.update(id, sanitizeParkingLotBaseInput(input), options)
        await refreshAfterMutation()
        return record
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function updateAvailability(id: string, availableSpaces: number): Promise<ParkingLot | null> {
      updatingAvailabilityId.value = id
      error.value = null
      try {
        const record = await service.updateAvailability(id, availableSpaces)
        await refreshAfterMutation()
        return record
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally {
        updatingAvailabilityId.value = null
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
        error.value = errorMessage(cause)
        return false
      }
      finally {
        deletingId.value = null
      }
    }

    function resetError(): void {
      error.value = null
    }

    return {
      records,
      mapRecords,
      query,
      page,
      pageSize,
      isLoading,
      isSaving,
      detailLoadingId,
      updatingAvailabilityId,
      deletingId,
      error,
      filteredRecords,
      paginatedRecords,
      total,
      pageCount,
      currentPage,
      setQuery,
      resetQuery,
      setPage,
      setPageSize,
      validateCreate,
      validateUpdate,
      load,
      loadPage,
      loadMap,
      get,
      create,
      update,
      updateEnabled,
      updateAvailability,
      remove,
      resetError,
    }
  })
}

export const useParkingLotStore = createParkingLotStore(parkingLotService)
