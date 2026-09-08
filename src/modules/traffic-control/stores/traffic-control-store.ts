import type {
  TrafficControl,
  TrafficControlExportFile,
  TrafficControlQuery,
  TrafficControlServerQuery,
  TrafficControlService,
  TrafficControlTimeStatus,
  TrafficControlValidationResult,
  TrafficControlWriteInput,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { trafficControlService, validateTrafficControlInput } from '../services/traffic-control-service'

const DEFAULT_QUERY: TrafficControlQuery = { keyword: '', type: 'all', publishStatus: 'all', timeStatus: 'all', dateStart: '', dateEnd: '' }
const PAGE_SIZE = 20
const MAP_PAGE_SIZE = 100

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function serverQuery(query: TrafficControlQuery): TrafficControlServerQuery {
  return { ...query }
}

function writeInput(item: TrafficControl, patch: Partial<TrafficControlWriteInput> = {}): TrafficControlWriteInput {
  return {
    title: item.title,
    type: item.type,
    areaName: item.areaName,
    startAt: item.startAt,
    endAt: item.endAt,
    publishAt: item.publishAt,
    detourInstructions: item.detourInstructions,
    geometry: item.geometry,
    pinned: item.pinned,
    sortOrder: item.sortOrder,
    ...patch,
  }
}

export function deriveTrafficControlTimeStatus(item: Pick<TrafficControl, 'startAt' | 'endAt'>, now = new Date()): TrafficControlTimeStatus {
  const current = now.getTime()
  if (current < Date.parse(item.startAt)) return 'upcoming'
  if (current <= Date.parse(item.endAt)) return 'active'
  return 'ended'
}

type TrafficControlView = 'list' | 'map'

export function createTrafficControlStore(service: TrafficControlService, now: () => Date = () => new Date(), storeId = 'traffic-control') {
  return defineStore(storeId, () => {
    const records = ref<TrafficControl[]>([])
    const mapRecords = ref<TrafficControl[]>([])
    const query = reactive<TrafficControlQuery>({ ...DEFAULT_QUERY })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const isExporting = ref(false)
    const detailLoadingId = ref<string | null>(null)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    const total = ref(0)
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    let requestSequence = 0
    let currentView: TrafficControlView = 'list'

    async function loadView(nextQuery: TrafficControlQuery, nextPage: number, nextSize: number, view: TrafficControlView): Promise<boolean> {
      const requestId = ++requestSequence
      const appliedQuery = { ...nextQuery, keyword: nextQuery.keyword.trim().normalize('NFKC') }
      currentView = view
      isLoading.value = true
      error.value = null
      try {
        if (view === 'map') {
          const result = await service.list(serverQuery(appliedQuery), MAP_PAGE_SIZE)
          if (requestId !== requestSequence) return true
          mapRecords.value = result
          page.value = nextPage
        }
        else {
          let result = await service.listPage(nextPage, nextSize, serverQuery(appliedQuery))
          if (requestId !== requestSequence) return true
          const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize))
          if (result.page > lastPage) result = await service.listPage(lastPage, nextSize, serverQuery(appliedQuery))
          if (requestId !== requestSequence) return true
          records.value = result.records
          total.value = result.total
          page.value = result.page
          pageSize.value = result.pageSize
        }
        Object.assign(query, appliedQuery)
        return true
      }
      catch (cause) {
        if (requestId !== requestSequence) return true
        error.value = errorMessage(cause)
        return false
      }
      finally {
        if (requestId === requestSequence) isLoading.value = false
      }
    }

    async function load(): Promise<boolean> {
      return loadView(query, page.value, pageSize.value, 'list')
    }

    async function loadMap(): Promise<boolean> {
      return loadView(query, page.value, pageSize.value, 'map')
    }

    async function setQuery(patch: Partial<TrafficControlQuery>, view: TrafficControlView = currentView): Promise<boolean> {
      return loadView({ ...query, ...patch }, 1, pageSize.value, view)
    }

    async function resetQuery(view: TrafficControlView = currentView): Promise<boolean> {
      return loadView(DEFAULT_QUERY, 1, pageSize.value, view)
    }

    async function setPage(value: number): Promise<boolean> {
      if (!Number.isFinite(value)) return false
      return loadView(query, Math.min(Math.max(Math.trunc(value), 1), pageCount.value), pageSize.value, 'list')
    }

    async function setPageSize(value: number): Promise<boolean> {
      if (!Number.isInteger(value) || value <= 0 || value > 100) return false
      return loadView(query, 1, value, 'list')
    }

    function validate(input: TrafficControlWriteInput, mode: 'create' | 'edit'): TrafficControlValidationResult {
      return validateTrafficControlInput(input, { mode, now: now() })
    }

    async function get(id: string): Promise<TrafficControl | null> {
      detailLoadingId.value = id
      error.value = null
      try {
        return await service.get(id)
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { detailLoadingId.value = null }
    }

    async function refreshAfterMutation(firstPage = false): Promise<void> {
      if (!await loadView(query, firstPage ? 1 : page.value, pageSize.value, currentView)) {
        error.value = `操作已成功，但最新数据刷新失败：${error.value}`
      }
    }

    async function create(input: TrafficControlWriteInput): Promise<TrafficControl | null> {
      const result = validate(input, 'create')
      if (!result.valid) {
        error.value = result.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.create(input)
        await refreshAfterMutation(true)
        return record
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { isSaving.value = false }
    }

    async function update(id: string, input: TrafficControlWriteInput): Promise<TrafficControl | null> {
      const result = validate(input, 'edit')
      if (!result.valid) {
        error.value = result.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.update(id, input)
        await refreshAfterMutation()
        return record
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { isSaving.value = false }
    }

    async function remove(id: string): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        await service.remove(id)
        await refreshAfterMutation()
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally { deletingId.value = null }
    }

    async function togglePinned(item: TrafficControl): Promise<TrafficControl | null> {
      isSaving.value = true
      error.value = null
      try {
        const latest = await service.get(item.id)
        const record = await service.update(item.id, writeInput(latest, { pinned: !latest.pinned }))
        await refreshAfterMutation()
        return record
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { isSaving.value = false }
    }

    async function changePublishStatus(item: TrafficControl, action: 'publish' | 'revoke'): Promise<TrafficControl | null> {
      isSaving.value = true
      error.value = null
      try {
        const record = action === 'publish' ? await service.publish(item.id) : await service.revoke(item.id)
        await refreshAfterMutation()
        return record
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { isSaving.value = false }
    }

    const publish = (item: TrafficControl) => changePublishStatus(item, 'publish')
    const revoke = (item: TrafficControl) => changePublishStatus(item, 'revoke')

    async function exportCurrent(): Promise<TrafficControlExportFile | null> {
      isExporting.value = true
      error.value = null
      try {
        return await service.export(serverQuery(query))
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { isExporting.value = false }
    }

    function resetError(): void { error.value = null }
    async function refreshTime(view: TrafficControlView = currentView): Promise<boolean> {
      if (query.timeStatus === 'all' || isLoading.value || isSaving.value || deletingId.value) return true
      return loadView(query, page.value, pageSize.value, view)
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
      detailLoadingId,
      deletingId,
      error,
      total,
      pageCount,
      currentPage,
      setQuery,
      resetQuery,
      setPage,
      setPageSize,
      validate,
      load,
      loadMap,
      get,
      create,
      update,
      remove,
      togglePinned,
      publish,
      revoke,
      exportCurrent,
      resetError,
      refreshTime,
    }
  })
}

export const useTrafficControlStore = createTrafficControlStore(trafficControlService)
