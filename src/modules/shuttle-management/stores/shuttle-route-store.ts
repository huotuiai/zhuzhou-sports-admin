import type {
  ShuttleRoadRoutesResult,
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
  status: 'all',
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function normalizeQuery(value: ShuttleRouteQuery): ShuttleRouteQuery {
  return {
    keyword: value.keyword.trim().normalize('NFKC'),
    direction: value.direction,
    operatingStatus: value.operatingStatus,
    status: value.status,
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
    const savingRoadRoutesId = ref<string | null>(null)
    const roadRouteWarnings = ref<Record<string, string>>({})
    const isMutating = computed(() => isSaving.value || Boolean(savingRoadRoutesId.value) || Boolean(deletingId.value))

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
        const routes = await service.list(normalizeQuery(query))
        // 道路折线仅在详情返回；只在打开地图时按需读取，并限制并发。
        let nextIndex = 0
        const loaded = await Promise.allSettled(Array.from({ length: Math.min(4, routes.length) }, async () => {
          while (nextIndex < routes.length) {
            const index = nextIndex++
            const route = routes[index]!
            if (route.roadRoutes === undefined) routes[index] = await service.get(route.id)
          }
        }))
        const failed = loaded.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') throw failed.reason
        mapRecords.value = routes.map(route => hasRoadRouteWarning(route) ? { ...route, roadRoutes: [] } : route)
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

    async function loadStationRoute(id: string): Promise<ShuttleRoute | null> {
      error.value = null
      try {
        const route = await service.get(id)
        if (!route.stationsInherited) return route
        if (!route.pairLineId) throw new Error('本线路站点继承自入场线路，请从对应入场线路配置。')
        const source = await service.get(route.pairLineId)
        if (source.stationsInherited || source.direction !== 'inbound') {
          throw new Error('未找到可配置站点的入场线路，请刷新后重试。')
        }
        return source
      }
      catch (cause) {
        error.value = message(cause)
        return null
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
      if (isMutating.value) return null
      const validation = validateShuttleRouteCreateInput(input)
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
      if (isMutating.value) return null
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
      if (isMutating.value) return null
      const validation = validateShuttleStations(stations)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.replaceStations(id, sanitizeShuttleStations(stations))
        // PUT 已提交成功，后续规划失败不能把站点保存也报告为失败。
        for (const collection of [records.value, mapRecords.value]) {
          for (const [index, cached] of collection.entries()) {
            if (cached.id === record.id) collection[index] = { ...record, roadRoutes: [] }
            else if (cached.stationsInherited && cached.pairLineId === record.id) {
              collection[index] = { ...cached, stations: [...record.stations].reverse(), roadRoutes: [] }
            }
          }
        }
        const roads = await persistRoadRoutes(id)
        await refreshAfterMutation()
        return { ...record, roadRoutes: roads?.routes ?? [] }
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    function hasRoadRouteWarning(route: ShuttleRoute): boolean {
      return Boolean(roadRouteWarnings.value[route.id]
        || (route.stationsInherited && route.pairLineId && roadRouteWarnings.value[route.pairLineId]))
    }

    function applyRoadRoutes(requestedId: string, result: ShuttleRoadRoutesResult): void {
      for (const collection of [records.value, mapRecords.value]) {
        for (const route of collection) {
          if (route.id === requestedId || route.id === result.lineId
            || (route.stationsInherited && route.pairLineId === result.lineId)) {
            route.roadRoutes = result.routes
            delete roadRouteWarnings.value[route.id]
          }
        }
      }
      delete roadRouteWarnings.value[requestedId]
      delete roadRouteWarnings.value[result.lineId]
    }

    async function persistRoadRoutes(id: string): Promise<ShuttleRoadRoutesResult | null> {
      savingRoadRoutesId.value = id
      const cached = [...records.value, ...mapRecords.value].find(route => route.id === id)
      let sourceId = cached?.stationsInherited && cached.pairLineId ? cached.pairLineId : id
      try {
        const result = await service.saveRoadRoutes(id)
        sourceId = result.lineId
        const failed = result.routes.find(road => !road.enabled || road.lastError)
        if (failed) throw new Error(failed.lastError || '后端返回的道路路径已失效')
        if (result.routes.length && new Set(result.routes.map(road => road.direction)).size !== 2) {
          throw new Error('后端未返回完整的入场和离场道路路径')
        }
        applyRoadRoutes(id, result)
        return result
      }
      catch (cause) {
        roadRouteWarnings.value[sourceId] = `道路路径未更新，请重试：${message(cause)}`
        for (const collection of [records.value, mapRecords.value]) {
          for (const route of collection) {
            if (hasRoadRouteWarning(route)) route.roadRoutes = []
          }
        }
        return null
      }
      finally {
        savingRoadRoutesId.value = null
      }
    }

    async function saveRoadRoutes(id: string): Promise<boolean> {
      if (isMutating.value) return false
      return Boolean(await persistRoadRoutes(id))
    }

    async function remove(id: string): Promise<boolean> {
      if (isMutating.value) return false
      deletingId.value = id
      error.value = null
      try {
        await service.remove(id)
        delete roadRouteWarnings.value[id]
        mapRecords.value = mapRecords.value.filter(route => route.id !== id)
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
      savingRoadRoutesId,
      roadRouteWarnings,
      isMutating,
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
      loadStationRoute,
      exportCurrent,
      create,
      update,
      replaceStations,
      saveRoadRoutes,
      remove,
      resetError,
      validateCreate: validateShuttleRouteCreateInput,
      validateUpdate: validateShuttleRouteUpdateInput,
      validateStations: validateShuttleStations,
    }
  })
}

export const useShuttleRouteStore = createShuttleRouteStore(shuttleRouteService)
