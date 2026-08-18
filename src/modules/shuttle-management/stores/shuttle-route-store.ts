import type {
  ShuttleRoute,
  ShuttleRouteCreateInput,
  ShuttleRouteQuery,
  ShuttleRouteService,
  ShuttleRouteUpdateInput,
  ShuttleStation,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  sanitizeShuttleRouteBaseInput,
  sanitizeShuttleRouteCreateInput,
  sanitizeShuttleStations,
  shuttleRouteService,
  sortShuttleRoutes,
  validateShuttleRouteCreateInput,
  validateShuttleRouteUpdateInput,
  validateShuttleStations,
} from '../services/shuttle-route-service'

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function contains(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword)
}

export function createShuttleRouteStore(service: ShuttleRouteService, storeId = 'shuttle-route') {
  return defineStore(storeId, () => {
    const records = ref<ShuttleRoute[]>([])
    const query = reactive<ShuttleRouteQuery>({ keyword: '', direction: 'all', operatingStatus: 'all' })
    const page = ref(1)
    const pageSize = ref(20)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const filteredRecords = computed(() => {
      const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      return records.value.filter((item) => {
        if (keyword && ![item.code, item.name].some((value) => contains(value, keyword))) return false
        if (query.direction !== 'all' && item.direction !== query.direction) return false
        if (query.operatingStatus !== 'all' && item.operatingStatus !== query.operatingStatus) return false
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

    function setQuery(patch: Partial<ShuttleRouteQuery>): void {
      Object.assign(query, patch)
      page.value = 1
    }
    function resetQuery(): void {
      Object.assign(query, { keyword: '', direction: 'all', operatingStatus: 'all' })
      page.value = 1
    }
    function setPage(value: number): void {
      if (Number.isFinite(value)) page.value = Math.min(Math.max(Math.trunc(value), 1), pageCount.value)
    }
    function setPageSize(value: number): void {
      if (Number.isInteger(value) && value > 0) {
        pageSize.value = value
        page.value = 1
      }
    }
    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        records.value = sortShuttleRoutes(await service.list())
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
    async function create(input: ShuttleRouteCreateInput): Promise<ShuttleRoute | null> {
      const validation = validateShuttleRouteCreateInput(input, records.value)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.create(sanitizeShuttleRouteCreateInput(input))
        records.value = sortShuttleRoutes([...records.value, record])
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
    async function update(id: string, input: ShuttleRouteUpdateInput): Promise<ShuttleRoute | null> {
      const validation = validateShuttleRouteUpdateInput(input)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.update(id, sanitizeShuttleRouteBaseInput(input))
        records.value = sortShuttleRoutes([...records.value.filter((item) => item.id !== id), record])
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
    async function replaceStations(id: string, stations: readonly ShuttleStation[]): Promise<ShuttleRoute | null> {
      const validation = validateShuttleStations(stations)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.replaceStations(id, sanitizeShuttleStations(stations))
        records.value = sortShuttleRoutes([...records.value.filter((item) => item.id !== id), record])
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
    async function remove(id: string): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        await service.remove(id)
        records.value = records.value.filter((item) => item.id !== id)
        page.value = Math.min(page.value, pageCount.value)
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
    function resetError(): void { error.value = null }

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
      total,
      pageCount,
      currentPage,
      paginatedRecords,
      setQuery,
      resetQuery,
      setPage,
      setPageSize,
      load,
      create,
      update,
      replaceStations,
      remove,
      resetError,
      validateCreate: (input: ShuttleRouteCreateInput) => validateShuttleRouteCreateInput(input, records.value),
      validateUpdate: validateShuttleRouteUpdateInput,
      validateStations: validateShuttleStations,
    }
  })
}

export const useShuttleRouteStore = createShuttleRouteStore(shuttleRouteService)
