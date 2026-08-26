import type {
  ParkingLot,
  ParkingLotCreateInput,
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
  sortParkingLots,
  validateParkingLotBaseInput,
  validateParkingLotCreateInput,
} from '../services/parking-lot-service'

const DEFAULT_QUERY: ParkingLotQuery = {
  keyword: '',
  feeType: 'all',
  openStatus: 'all',
  availabilityUpdateMethod: 'all',
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function includes(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword)
}

export function createParkingLotStore(service: ParkingLotService, storeId = 'parking-lot') {
  return defineStore(storeId, () => {
    const records = ref<ParkingLot[]>([])
    const query = reactive<ParkingLotQuery>({ ...DEFAULT_QUERY })
    const page = ref(1)
    const pageSize = ref(20)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const updatingAvailabilityId = ref<string | null>(null)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const filteredRecords = computed(() => {
      const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      return sortParkingLots(records.value.filter((record) => {
        if (keyword && ![record.code, record.name].some((value) => includes(value, keyword))) return false
        if (query.feeType !== 'all' && record.feeType !== query.feeType) return false
        if (query.openStatus !== 'all' && record.openStatus !== query.openStatus) return false
        if (query.availabilityUpdateMethod !== 'all' && record.availabilityUpdateMethod !== query.availabilityUpdateMethod) return false
        return true
      }))
    })
    const total = computed(() => filteredRecords.value.length)
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const paginatedRecords = computed(() => {
      const start = (currentPage.value - 1) * pageSize.value
      return filteredRecords.value.slice(start, start + pageSize.value)
    })

    function setQuery(patch: Partial<ParkingLotQuery>): void {
      Object.assign(query, patch)
      page.value = 1
    }

    function resetQuery(): void {
      Object.assign(query, DEFAULT_QUERY)
      page.value = 1
    }

    function setPage(value: number): void {
      if (Number.isFinite(value)) page.value = Math.min(Math.max(Math.trunc(value), 1), pageCount.value)
    }

    function setPageSize(value: number): void {
      if (value !== 20) return
      pageSize.value = 20
      page.value = 1
    }

    function validateCreate(input: ParkingLotCreateInput): ParkingLotValidationResult {
      return validateParkingLotCreateInput(input, records.value)
    }

    function validateUpdate(input: ParkingLotUpdateInput): ParkingLotValidationResult {
      return validateParkingLotBaseInput(input)
    }

    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        records.value = sortParkingLots(await service.list())
        page.value = Math.min(page.value, pageCount.value)
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

    async function create(input: ParkingLotCreateInput): Promise<ParkingLot | null> {
      const validation = validateCreate(input)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.create(sanitizeParkingLotCreateInput(input))
        records.value = sortParkingLots([...records.value, record])
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
        records.value = sortParkingLots([...records.value.filter((item) => item.id !== id), record])
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
        records.value = sortParkingLots([...records.value.filter((item) => item.id !== id), record])
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
        records.value = records.value.filter((record) => record.id !== id)
        page.value = Math.min(page.value, pageCount.value)
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
      query,
      page,
      pageSize,
      isLoading,
      isSaving,
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
      create,
      update,
      updateAvailability,
      remove,
      resetError,
    }
  })
}

export const useParkingLotStore = createParkingLotStore(parkingLotService)
