import type {
  SeatFloor,
  SeatFloorValidationResult,
  SeatFloorWriteInput,
  SeatGateOption,
  SeatPlanningQuery,
  SeatPlanningService,
  SeatZone,
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
  sortSeatZones,
  validateSeatFloorInput,
  validateSeatZoneInput,
} from '../services/venue-seat-service'

const PAGE_SIZE = 20
const SERVER_PAGE_SIZE = 100

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
    const initialized = ref(false)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const changingStatusId = ref<string | null>(null)
    const detailLoadingId = ref<string | null>(null)
    const error = ref<string | null>(null)
    let initializePromise: Promise<boolean> | null = null

    const gateById = computed(() => new Map(ticketGates.value.map(item => [item.id, item])))
    const filteredZones = computed(() => {
      const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      const selectedGateIds = new Set(query.gateIds)
      return zones.value.filter((item) => {
        if (keyword && ![item.code, item.name].some(value => value.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword))) return false
        if (query.floorId !== 'all' && item.floorId !== query.floorId) return false
        if (query.status !== 'all' && item.status !== query.status) return false
        if (selectedGateIds.size && !item.gateIds.some(id => selectedGateIds.has(id))) return false
        return true
      })
    })
    const total = computed(() => filteredZones.value.length)
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const paginatedZones = computed(() => {
      const start = (currentPage.value - 1) * pageSize.value
      return filteredZones.value.slice(start, start + pageSize.value)
    })

    async function fetchAllZones(): Promise<SeatZone[]> {
      const first = await service.listZones(1, SERVER_PAGE_SIZE)
      const records = [...first.zones]
      const pages = Math.ceil(first.total / Math.max(1, first.pageSize))
      for (let nextPage = 2; nextPage <= pages; nextPage += 1) {
        const result = await service.listZones(nextPage, SERVER_PAGE_SIZE)
        records.push(...result.zones)
      }
      const unique = new Map(records.map(item => [item.id, item]))
      return sortSeatZones([...unique.values()], floors.value)
    }

    function applyFloors(value: readonly SeatFloor[]): void {
      floors.value = sortSeatFloors(value)
      zones.value = sortSeatZones(zones.value, floors.value)
    }

    function applyZones(value: readonly SeatZone[]): void {
      zones.value = sortSeatZones(value, floors.value)
      page.value = Math.min(page.value, pageCount.value)
    }

    function applyTicketGates(value: readonly SeatGateOption[]): void {
      ticketGates.value = value.map(cloneGate)
    }

    async function loadBundle(): Promise<void> {
      const [nextFloors, nextGates] = await Promise.all([service.listFloors(), service.listGateOptions()])
      applyFloors(nextFloors)
      const nextZones = await fetchAllZones()
      applyZones(nextZones)
      applyTicketGates(nextGates)
    }

    async function initialize(force = false): Promise<boolean> {
      if (initialized.value && !force) return true
      if (initializePromise) return initializePromise
      isLoading.value = true
      error.value = null
      initializePromise = loadBundle()
        .then(() => {
          initialized.value = true
          return true
        })
        .catch((cause: unknown) => {
          error.value = message(cause)
          return false
        })
        .finally(() => {
          isLoading.value = false
          initializePromise = null
        })
      return initializePromise
    }

    async function queryZones(nextQuery: SeatPlanningQuery): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        applyZones(await fetchAllZones())
        Object.assign(query, normalizedQuery(nextQuery))
        page.value = 1
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

    async function resetQuery(): Promise<boolean> {
      return queryZones({ ...DEFAULT_SEAT_PLANNING_QUERY, gateIds: [] })
    }

    function setPage(value: number): void {
      if (Number.isFinite(value)) page.value = Math.min(Math.max(Math.trunc(value), 1), pageCount.value)
    }

    function setPageSize(value: number): void {
      if (![20, 50, 100].includes(value)) return
      pageSize.value = value
      page.value = 1
    }

    function validateFloor(input: SeatFloorWriteInput): SeatFloorValidationResult {
      return validateSeatFloorInput(input, floors.value)
    }

    function validateZone(input: SeatZoneWriteInput, excludedId?: string): SeatZoneValidationResult {
      return validateSeatZoneInput(input, zones.value, floors.value, ticketGates.value, excludedId)
    }

    function zoneGateIds(zoneCode: string): string[] {
      const zone = zones.value.find(item => item.code === zoneCode)
      return [...(zone?.gateIds ?? [])]
        .sort((first, second) => (gateById.value.get(first)?.code ?? first).localeCompare(gateById.value.get(second)?.code ?? second, 'zh-CN', { numeric: true }))
    }

    function matchingZoneCount(floorId: string): number {
      return filteredZones.value.filter(item => item.floorId === floorId).length
    }

    function totalZoneCount(floorId: string): number {
      return floors.value.find(item => item.id === floorId)?.zoneCount ?? zones.value.filter(item => item.floorId === floorId).length
    }

    function nextSortOrder(floorId: string): number {
      return zones.value.filter(item => item.floorId === floorId).reduce((maximum, item) => Math.max(maximum, item.sortOrder), 0) + 1
    }

    async function refreshAfterZoneMutation(): Promise<void> {
      try {
        const [nextFloors, nextZones] = await Promise.all([service.listFloors(), fetchAllZones()])
        applyFloors(nextFloors)
        applyZones(nextZones)
      }
      catch (cause) {
        error.value = `操作已成功，但最新列表刷新失败：${message(cause)}`
      }
    }

    async function getZone(id: string): Promise<SeatZone | null> {
      detailLoadingId.value = id
      error.value = null
      try {
        const zone = await service.getZone(id)
        applyZones([...zones.value.filter(item => item.id !== id), zone])
        return zone
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
        if (query.floorId === id) Object.assign(query, { ...DEFAULT_SEAT_PLANNING_QUERY, gateIds: [] })
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
        applyZones([...zones.value, zone])
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

    async function updateZone(id: string, input: SeatZoneWriteInput): Promise<SeatZone | null> {
      const validation = validateZone(input, id)
      if (!validation.valid) {
        error.value = validation.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const zone = await service.updateZone(id, sanitizeSeatZoneInput(input))
        applyZones([...zones.value.filter(item => item.id !== id), zone])
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
        applyZones([...zones.value.filter(item => item.id !== id), zone])
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
        applyZones(zones.value.filter(item => item.id !== id))
        await refreshAfterZoneMutation()
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
      deletingId,
      changingStatusId,
      detailLoadingId,
      error,
      filteredZones,
      total,
      pageCount,
      currentPage,
      paginatedZones,
      initialize,
      queryZones,
      resetQuery,
      setPage,
      setPageSize,
      validateFloor,
      validateZone,
      zoneGateIds,
      matchingZoneCount,
      totalZoneCount,
      nextSortOrder,
      getZone,
      createFloor,
      removeFloor,
      createZone,
      updateZone,
      updateStatus,
      removeZone,
      resetError,
    }
  })
}

export const useSeatPlanningStore = createSeatPlanningStore(seatPlanningService)
