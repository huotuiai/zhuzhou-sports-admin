import type {
  ShuttleRoute,
  ShuttleRouteCreateInput,
  ShuttleRoutePage,
  ShuttleRouteQuery,
  ShuttleRouteService,
  ShuttleRouteUpdateInput,
  ShuttleStation,
} from '../types'
import type { BackendCsvExportFile } from '@/lib/http'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  sanitizeShuttleRouteBaseInput,
  sanitizeShuttleRouteCreateInput,
  sanitizeShuttleStations,
  shuttleRouteService,
  validateShuttleRouteCreateInput,
  validateShuttleRouteUpdateInput,
  validateShuttleStations,
} from '../services/shuttle-route-service'

const PAGE_SIZE = 20

const DEFAULT_QUERY: ShuttleRouteQuery = {
  keyword: '',
  direction: 'all',
  operatingStatus: 'all',
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function normalizeQuery(value: ShuttleRouteQuery): ShuttleRouteQuery {
  return {
    keyword: value.keyword.trim().normalize('NFKC'),
    direction: value.direction,
    operatingStatus: value.operatingStatus,
  }
}

export function createShuttleRouteStore(service: ShuttleRouteService, storeId = 'shuttle-route') {
  return defineStore(storeId, () => {
    const records = ref<ShuttleRoute[]>([])
    const mapRecords = ref<ShuttleRoute[]>([])
    const query = reactive<ShuttleRouteQuery>({ ...DEFAULT_QUERY })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const total = ref(0)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const isExporting = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, pageSize.value))))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const filteredRecords = computed(() => records.value)
    const paginatedRecords = computed(() => records.value)

    function applyPage(result: ShuttleRoutePage): void {
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

    async function loadMap(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        mapRecords.value = await service.list(normalizeQuery(query))
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

    async function setQuery(patch: Partial<ShuttleRouteQuery>): Promise<boolean> {
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

    async function exportCurrent(): Promise<BackendCsvExportFile | null> {
      if (isExporting.value) return null
      isExporting.value = true
      error.value = null
      try {
        return await service.exportCsv(normalizeQuery(query))
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isExporting.value = false
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
    }

    return {
      records,
      mapRecords,
      query,
      page,
      pageSize,
      isLoading,
      isSaving,
      isExporting,
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
      loadPage,
      loadMap,
      exportCurrent,
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
