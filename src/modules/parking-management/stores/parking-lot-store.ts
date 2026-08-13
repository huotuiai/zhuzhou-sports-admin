import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  parkingLotService,
  sanitizeParkingLotInput,
  sortParkingLotsByUpdatedAt,
  validateParkingLotInput,
} from '../services/parking-lot-service'
import type {
  ParkingLot,
  ParkingLotQuery,
  ParkingLotService,
  ParkingLotStatusFilter,
  ParkingLotValidationResult,
  ParkingLotWriteInput,
} from '../types'

export const DEFAULT_PARKING_LOT_PAGE_SIZE = 10

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function includesNormalized(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword)
}

export function createParkingLotStore(service: ParkingLotService, storeId = 'parking-lot') {
  return defineStore(storeId, () => {
    const records = ref<ParkingLot[]>([])
    const query = reactive<ParkingLotQuery>({ name: '', code: '', status: 'all' })
    const page = ref(1)
    const pageSize = ref(DEFAULT_PARKING_LOT_PAGE_SIZE)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const filteredRecords = computed(() => {
      const nameKeyword = query.name.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      const codeKeyword = query.code.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      return records.value.filter((record) => {
        if (nameKeyword && !includesNormalized(record.name, nameKeyword)) return false
        if (codeKeyword && !includesNormalized(record.code, codeKeyword)) return false
        if (query.status === 'enabled' && !record.enabled) return false
        if (query.status === 'disabled' && record.enabled) return false
        return true
      })
    })

    const total = computed(() => filteredRecords.value.length)
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const paginatedRecords = computed(() => {
      const start = (currentPage.value - 1) * pageSize.value
      return filteredRecords.value.slice(start, start + pageSize.value)
    })

    function setQuery(patch: Partial<ParkingLotQuery>): void {
      if (patch.name !== undefined) query.name = patch.name
      if (patch.code !== undefined) query.code = patch.code
      if (patch.status !== undefined) query.status = patch.status
      page.value = 1
    }

    function resetQuery(): void {
      query.name = ''
      query.code = ''
      query.status = 'all'
      page.value = 1
    }

    function setPage(nextPage: number): void {
      if (!Number.isFinite(nextPage)) return
      page.value = Math.min(Math.max(Math.trunc(nextPage), 1), pageCount.value)
    }

    function setPageSize(nextPageSize: number): void {
      if (!Number.isInteger(nextPageSize) || nextPageSize <= 0) return
      pageSize.value = nextPageSize
      page.value = 1
    }

    function validate(
      input: ParkingLotWriteInput,
      excludedId?: string,
    ): ParkingLotValidationResult {
      return validateParkingLotInput(input, records.value, excludedId)
    }

    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        records.value = await service.list()
        page.value = Math.min(page.value, pageCount.value)
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        isLoading.value = false
      }
    }

    async function create(input: ParkingLotWriteInput): Promise<ParkingLot | null> {
      const validation = validate(input)
      if (!validation.valid) {
        error.value = validation.issues[0]?.message ?? '请完善停车场信息'
        return null
      }

      isSaving.value = true
      error.value = null
      try {
        const created = await service.create(sanitizeParkingLotInput(input))
        records.value = sortParkingLotsByUpdatedAt([
          ...records.value.filter((record) => record.id !== created.id),
          created,
        ])
        return created
      } catch (cause) {
        error.value = errorMessage(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function update(id: string, input: ParkingLotWriteInput): Promise<ParkingLot | null> {
      const validation = validate(input, id)
      if (!validation.valid) {
        error.value = validation.issues[0]?.message ?? '请完善停车场信息'
        return null
      }

      isSaving.value = true
      error.value = null
      try {
        const updated = await service.update(id, sanitizeParkingLotInput(input))
        records.value = sortParkingLotsByUpdatedAt([
          ...records.value.filter((record) => record.id !== updated.id),
          updated,
        ])
        return updated
      } catch (cause) {
        error.value = errorMessage(cause)
        return null
      } finally {
        isSaving.value = false
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
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
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
      validate,
      load,
      create,
      update,
      remove,
      resetError,
    }
  })
}

export const useParkingLotStore = createParkingLotStore(parkingLotService)

export type { ParkingLotStatusFilter }
