import type { BackendCsvExportFile } from '@/lib/http'
import type {
  SeatFloor,
  SeatFloorValidationResult,
  SeatFloorWriteInput,
  SeatGateOption,
  SeatPlanningQuery,
  SeatPlanningService,
  SeatZone,
  SeatZoneImportResult,
  SeatZoneStatus,
  SeatZoneValidationResult,
  SeatZoneWriteInput,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  sanitizeSeatFloorInput,
  sanitizeSeatZoneInput,
  seatPlanningService,
  sortSeatFloors,
  validateSeatFloorInput,
  validateSeatZoneInput,
} from '../services/venue-seat-service'

const PAGE_SIZE = 20

export const DEFAULT_SEAT_PLANNING_QUERY: Readonly<SeatPlanningQuery> = {
  keyword: '',
  floorId: 'all',
  status: 'all',
  gateIds: [],
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function normalizedQuery(value: SeatPlanningQuery): SeatPlanningQuery {
  return {
    keyword: value.keyword.trim().normalize('NFKC'),
    floorId: value.floorId,
    status: value.status,
    gateIds: [...new Set(value.gateIds)],
  }
}

function cloneGate(value: SeatGateOption): SeatGateOption {
  return { ...value }
}

function toWriteInput(zone: SeatZone, status: SeatZoneStatus = zone.status): SeatZoneWriteInput {
  return {
    code: zone.code,
    name: zone.name,
    floorId: zone.floorId,
    rowStart: zone.rowStart,
    rowEnd: zone.rowEnd,
    gateIds: [...zone.gateIds],
    sortOrder: zone.sortOrder,
    status,
    remark: zone.remark,
  }
}

export function createSeatPlanningStore(service: SeatPlanningService, storeId = 'seat-planning') {
  return defineStore(storeId, () => {
    const floors = ref<SeatFloor[]>([])
    const zones = ref<SeatZone[]>([])
    const ticketGates = ref<SeatGateOption[]>([])
    const query = reactive<SeatPlanningQuery>({ ...DEFAULT_SEAT_PLANNING_QUERY, gateIds: [] })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const total = ref(0)
    const initialized = ref(false)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const isExporting = ref(false)
    const isImporting = ref(false)
    const deletingId = ref<string | null>(null)
    const changingStatusId = ref<string | null>(null)
    const detailLoadingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    let initializePromise: Promise<boolean> | null = null
    let pageRequestSequence = 0

    const gateById = computed(() => new Map(ticketGates.value.map(item => [item.id, item])))
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))

    function applyFloors(value: readonly SeatFloor[]): void {
      floors.value = sortSeatFloors(value)
    }

    function applyTicketGates(value: readonly SeatGateOption[]): void {
      ticketGates.value = value.map(cloneGate)
    }

    async function loadPage(nextQuery: SeatPlanningQuery, nextPage: number, nextPageSize: number, refreshOptions = false): Promise<boolean> {
      const requestId = ++pageRequestSequence
      const appliedQuery = normalizedQuery(nextQuery)
      isLoading.value = true
      error.value = null
      try {
        const [result, nextFloors, nextGates] = await Promise.all([
          service.listZones(nextPage, nextPageSize, appliedQuery),
          refreshOptions ? service.listFloors() : null,
          refreshOptions ? service.listGateOptions() : null,
        ])
        if (requestId !== pageRequestSequence) return true
        // 删除末页记录后，按后端总数回退到仍然存在的最后一页。
        const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize))
        const next = result.page > lastPage
          ? await service.listZones(lastPage, nextPageSize, appliedQuery)
          : result
        if (requestId !== pageRequestSequence) return true
        if (nextFloors) applyFloors(nextFloors)
        if (nextGates) applyTicketGates(nextGates)
        zones.value = next.zones
        total.value = next.total
        page.value = next.page
        pageSize.value = next.pageSize
        Object.assign(query, appliedQuery)
        if (refreshOptions) initialized.value = true
        return true
      }
      catch (cause) {
        if (requestId !== pageRequestSequence) return true
        error.value = message(cause)
        return false
      }
      finally {
        if (requestId === pageRequestSequence) isLoading.value = false
      }
    }

    async function refresh(): Promise<boolean> {
      if (initializePromise) return initializePromise
      initializePromise = loadPage(query, page.value, pageSize.value, true)
        .finally(() => {
          initializePromise = null
        })
      return initializePromise
    }

    async function initialize(force = false): Promise<boolean> {
      if (initialized.value && !force) return true
      return refresh()
    }

    async function queryZones(nextQuery: SeatPlanningQuery): Promise<boolean> {
      return loadPage(nextQuery, 1, pageSize.value)
    }

    async function resetQuery(): Promise<boolean> {
      return queryZones({ ...DEFAULT_SEAT_PLANNING_QUERY, gateIds: [] })
    }

    async function setPage(value: number): Promise<boolean> {
      if (!Number.isFinite(value)) return false
      return loadPage(query, Math.min(Math.max(Math.trunc(value), 1), pageCount.value), pageSize.value)
    }

    async function setPageSize(value: number): Promise<boolean> {
      const next = Math.trunc(Number(value))
      if (!Number.isInteger(next) || next <= 0 || next > 100) return false
      return loadPage(query, 1, next)
    }

    function validateFloor(input: SeatFloorWriteInput): SeatFloorValidationResult {
      return validateSeatFloorInput(input)
    }

    function validateZone(input: SeatZoneWriteInput): SeatZoneValidationResult {
      return validateSeatZoneInput(input, floors.value, ticketGates.value)
    }

    function zoneGateIds(zoneCode: string): string[] {
      const zone = zones.value.find(item => item.code === zoneCode)
      return [...(zone?.gateIds ?? [])]
        .sort((first, second) => (gateById.value.get(first)?.code ?? first).localeCompare(gateById.value.get(second)?.code ?? second, 'zh-CN', { numeric: true }))
    }

    function totalZoneCount(floorId: string): number {
      return floors.value.find(item => item.id === floorId)?.zoneCount ?? 0
    }

    async function refreshAfterZoneMutation(nextPage = page.value): Promise<void> {
      if (!await loadPage(query, nextPage, pageSize.value, true)) {
        error.value = `操作已成功，但最新列表刷新失败：${error.value}`
      }
    }

    async function getZone(id: string): Promise<SeatZone | null> {
      detailLoadingId.value = id
      error.value = null
      try {
        return await service.getZone(id)
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        detailLoadingId.value = null
      }
    }

    async function createFloor(input: SeatFloorWriteInput): Promise<SeatFloor | null> {
      const validation = validateFloor(input)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const floor = await service.createFloor({
          ...sanitizeSeatFloorInput(input),
          sortOrder: floors.value.reduce((maximum, item) => Math.max(maximum, item.sortOrder), 0) + 1,
          status: 'enabled',
        })
        applyFloors([...floors.value, floor])
        return floor
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function removeFloor(id: string): Promise<boolean> {
      const floor = floors.value.find(item => item.id === id)
      if (floor && floor.zoneCount > 0) {
        error.value = `楼层已绑定 ${floor.zoneCount} 个座位分区，无法删除`
        return false
      }
      deletingId.value = id
      error.value = null
      try {
        await service.deleteFloor(id)
        applyFloors(floors.value.filter(item => item.id !== id))
        if (query.floorId === id && !await resetQuery()) {
          error.value = `操作已成功，但最新列表刷新失败：${error.value}`
        }
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

    async function createZone(input: SeatZoneWriteInput): Promise<SeatZone | null> {
      const validation = validateZone(input)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const zone = await service.createZone(sanitizeSeatZoneInput(input))
        await refreshAfterZoneMutation(1)
        return zone
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function updateZone(id: string, input: SeatZoneWriteInput): Promise<SeatZone | null> {
      const validation = validateZone(input)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const zone = await service.updateZone(id, sanitizeSeatZoneInput(input))
        await refreshAfterZoneMutation()
        return zone
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isSaving.value = false
      }
    }

    async function updateStatus(id: string, status: SeatZoneStatus): Promise<SeatZone | null> {
      const current = zones.value.find(item => item.id === id)
      if (!current) {
        error.value = '未找到要更新状态的座位分区'
        return null
      }
      changingStatusId.value = id
      error.value = null
      try {
        const zone = await service.updateZone(id, toWriteInput(current, status))
        await refreshAfterZoneMutation()
        return zone
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        changingStatusId.value = null
      }
    }

    async function removeZone(id: string): Promise<boolean> {
      const current = zones.value.find(item => item.id === id)
      if (current?.status === 'enabled') {
        error.value = '启用中的分区需先停用再删除'
        return false
      }
      deletingId.value = id
      error.value = null
      try {
        await service.deleteZone(id)
        await refreshAfterZoneMutation()
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

    async function exportCsv(): Promise<BackendCsvExportFile | null> {
      if (isExporting.value) return null
      isExporting.value = true
      error.value = null
      try {
        return await service.exportCsv(normalizedQuery(query))
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isExporting.value = false
      }
    }

    async function importCsv(csv: string): Promise<SeatZoneImportResult | null> {
      if (isImporting.value) return null
      isImporting.value = true
      error.value = null
      try {
        const result = await service.importCsv(csv)
        if (!await loadPage(query, page.value, pageSize.value, true)) {
          error.value = `已成功导入 ${result.imported} 条座位分区，但最新列表刷新失败：${error.value}`
        }
        return result
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isImporting.value = false
      }
    }

    function resetError(): void {
      error.value = null
    }

    return {
      floors,
      zones,
      ticketGates,
      gateById,
      query,
      page,
      pageSize,
      initialized,
      isLoading,
      isSaving,
      isExporting,
      isImporting,
      deletingId,
      changingStatusId,
      detailLoadingId,
      error,
      total,
      pageCount,
      currentPage,
      initialize,
      refresh,
      queryZones,
      resetQuery,
      setPage,
      setPageSize,
      validateFloor,
      validateZone,
      zoneGateIds,
      totalZoneCount,
      getZone,
      createFloor,
      removeFloor,
      createZone,
      updateZone,
      updateStatus,
      removeZone,
      exportCsv,
      importCsv,
      resetError,
    }
  })
}

export const useSeatPlanningStore = createSeatPlanningStore(seatPlanningService)
