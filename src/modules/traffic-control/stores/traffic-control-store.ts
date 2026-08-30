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
import { sortTrafficControls, trafficControlService, validateTrafficControlInput } from '../services/traffic-control-service'

const DEFAULT_QUERY: TrafficControlQuery = { keyword: '', type: 'all', publishStatus: 'all', timeStatus: 'all', dateStart: '', dateEnd: '' }
const PAGE_SIZE = 20
const MAP_PAGE_SIZE = 100

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function serverQuery(query: TrafficControlQuery): TrafficControlServerQuery {
  return { keyword: query.keyword, type: query.type, publishStatus: query.publishStatus }
}

function writeInput(item: TrafficControl, patch: Partial<TrafficControlWriteInput> = {}): TrafficControlWriteInput {
  return {
    title: item.title,
    type: item.type,
    areaName: item.areaName,
    startAt: item.startAt,
    endAt: item.endAt,
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

function includes(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword)
}

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
    const clock = ref(now().getTime())

    function filterRecords(source: readonly TrafficControl[]): TrafficControl[] {
      const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      const rangeStart = query.dateStart ? new Date(query.dateStart + 'T00:00:00').getTime() : Number.NEGATIVE_INFINITY
      const rangeEnd = query.dateEnd ? new Date(query.dateEnd + 'T23:59:59.999').getTime() : Number.POSITIVE_INFINITY
      return sortTrafficControls(source.filter((item) => {
        if (keyword && ![item.code, item.title, item.areaName].some(value => includes(value, keyword))) return false
        if (query.type !== 'all' && item.type !== query.type) return false
        if (query.publishStatus !== 'all' && item.publishStatus !== query.publishStatus) return false
        if (query.timeStatus !== 'all' && deriveTrafficControlTimeStatus(item, new Date(clock.value)) !== query.timeStatus) return false
        if (Date.parse(item.startAt) > rangeEnd || Date.parse(item.endAt) < rangeStart) return false
        return true
      }))
    }

    const filteredRecords = computed(() => filterRecords(records.value))
    const filteredMapRecords = computed(() => filterRecords(mapRecords.value))
    const total = computed(() => filteredRecords.value.length)
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const paginatedRecords = computed(() => {
      const start = (currentPage.value - 1) * pageSize.value
      return filteredRecords.value.slice(start, start + pageSize.value)
    })

    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        records.value = await service.list(serverQuery(query), pageSize.value)
        page.value = Math.min(page.value, pageCount.value)
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally { isLoading.value = false }
    }

    async function loadMap(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        mapRecords.value = await service.list(serverQuery(query), MAP_PAGE_SIZE)
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally { isLoading.value = false }
    }

    async function setQuery(patch: Partial<TrafficControlQuery>): Promise<boolean> {
      Object.assign(query, patch)
      page.value = 1
      return load()
    }

    async function resetQuery(): Promise<boolean> {
      Object.assign(query, DEFAULT_QUERY)
      page.value = 1
      return load()
    }

    function setPage(value: number): void {
      if (Number.isFinite(value)) page.value = Math.min(Math.max(Math.trunc(value), 1), pageCount.value)
    }

    async function setPageSize(value: number): Promise<boolean> {
      const next = Math.trunc(Number(value))
      if (!Number.isInteger(next) || next <= 0) return false
      pageSize.value = next
      page.value = 1
      return load()
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

    async function refreshAfterMutation(): Promise<void> {
      await load()
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
        await refreshAfterMutation()
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

    async function exportAll(): Promise<TrafficControlExportFile | null> {
      isExporting.value = true
      error.value = null
      try {
        return await service.export()
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return null
      }
      finally { isExporting.value = false }
    }

    function resetError(): void { error.value = null }
    function refreshTime(): void { clock.value = now().getTime() }

    return {
      records,
      mapRecords: filteredMapRecords,
      query,
      page,
      pageSize,
      isLoading,
      isSaving,
      isExporting,
      detailLoadingId,
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
      exportAll,
      resetError,
      refreshTime,
    }
  })
}

export const useTrafficControlStore = createTrafficControlStore(trafficControlService)
