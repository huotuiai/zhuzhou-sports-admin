import type { TrafficControl, TrafficControlQuery, TrafficControlService, TrafficControlTimeStatus, TrafficControlValidationResult, TrafficControlWriteInput } from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { sortTrafficControls, trafficControlService, validateTrafficControlInput } from '../services/traffic-control-service'

const DEFAULT_QUERY: TrafficControlQuery = { keyword: '', type: 'all', timeStatus: 'all', dateStart: '', dateEnd: '' }
const PAGE_SIZE = 20

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
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
    const query = reactive<TrafficControlQuery>({ ...DEFAULT_QUERY })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    const clock = ref(now().getTime())

    const filteredRecords = computed(() => {
      const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      const rangeStart = query.dateStart ? new Date(`${query.dateStart}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
      const rangeEnd = query.dateEnd ? new Date(`${query.dateEnd}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY
      return sortTrafficControls(records.value.filter((item) => {
        if (keyword && ![item.code, item.title, item.areaName].some((value) => includes(value, keyword))) return false
        if (query.type !== 'all' && item.type !== query.type) return false
        if (query.timeStatus !== 'all' && deriveTrafficControlTimeStatus(item, new Date(clock.value)) !== query.timeStatus) return false
        if (Date.parse(item.startAt) > rangeEnd || Date.parse(item.endAt) < rangeStart) return false
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

    function setQuery(patch: Partial<TrafficControlQuery>): void {
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
      if (Number.isInteger(value) && value > 0) {
        pageSize.value = value
        page.value = 1
      }
    }
    function validate(input: TrafficControlWriteInput, mode: 'create' | 'edit'): TrafficControlValidationResult {
      return validateTrafficControlInput(input, { mode, now: now() })
    }
    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        records.value = await service.list()
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally { isLoading.value = false }
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
        records.value = sortTrafficControls([...records.value, record])
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
        records.value = sortTrafficControls([...records.value.filter((item) => item.id !== id), record])
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
        records.value = records.value.filter((item) => item.id !== id)
        page.value = Math.min(page.value, pageCount.value)
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally { deletingId.value = null }
    }
    async function togglePinned(item: TrafficControl): Promise<TrafficControl | null> {
      return update(item.id, {
        title: item.title,
        type: item.type,
        areaName: item.areaName,
        startAt: item.startAt,
        endAt: item.endAt,
        detourInstructions: item.detourInstructions,
        geometry: item.geometry,
        pinned: !item.pinned,
        sortOrder: item.sortOrder,
      })
    }
    function resetError(): void { error.value = null }
    function refreshTime(): void { clock.value = now().getTime() }

    return { records, query, page, pageSize, isLoading, isSaving, deletingId, error, filteredRecords, total, pageCount, currentPage, paginatedRecords, setQuery, resetQuery, setPage, setPageSize, validate, load, create, update, remove, togglePinned, resetError, refreshTime }
  })
}

export const useTrafficControlStore = createTrafficControlStore(trafficControlService)
