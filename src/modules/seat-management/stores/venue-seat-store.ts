import type {
  SeatFloor,
  SeatFloorValidationResult,
  SeatFloorWriteInput,
  SeatPlanningQuery,
  SeatPlanningService,
  SeatPlanningSnapshot,
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

function message(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function includes(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword)
}

export function createSeatPlanningStore(service: SeatPlanningService, storeId = 'seat-planning') {
  return defineStore(storeId, () => {
    const floors = ref<SeatFloor[]>([])
    const zones = ref<SeatZone[]>([])
    const bindings = ref<SeatPlanningSnapshot['bindings']>([])
    const ticketGates = ref<SeatPlanningSnapshot['ticketGates']>([])
    const query = reactive<SeatPlanningQuery>({ keyword: '', floorId: 'all', status: 'all', gateIds: [] })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const changingStatusId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const gateById = computed(() => new Map(ticketGates.value.map((item) => [item.id, item])))
    const gateIdsByZone = computed(() => {
      const result = new Map<string, string[]>()
      for (const binding of bindings.value) {
        const values = result.get(binding.zoneCode) ?? []
        values.push(binding.gateId)
        result.set(binding.zoneCode, values)
      }
      return result
    })

    const filteredZones = computed(() => {
      const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      const selectedGateIds = new Set(query.gateIds)
      return zones.value.filter((item) => {
        if (keyword && ![item.code, item.name].some((value) => includes(value, keyword))) return false
        if (query.floorId !== 'all' && item.floorId !== query.floorId) return false
        if (query.status !== 'all' && item.status !== query.status) return false
        if (selectedGateIds.size && !(gateIdsByZone.value.get(item.code) ?? []).some((id) => selectedGateIds.has(id))) return false
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

    function applySnapshot(snapshot: SeatPlanningSnapshot): void {
      floors.value = sortSeatFloors(snapshot.floors)
      zones.value = sortSeatZones(snapshot.zones, snapshot.floors)
      bindings.value = snapshot.bindings.map((item) => ({ ...item }))
      ticketGates.value = snapshot.ticketGates.map((item) => ({
        ...item,
        mapPoints: item.mapPoints.map((point) => ({ ...point })),
        navigationPoint: item.navigationPoint ? { ...item.navigationPoint } : null,
      }))
    }

    function setQuery(patch: Partial<SeatPlanningQuery>): void {
      Object.assign(query, patch, patch.gateIds ? { gateIds: [...new Set(patch.gateIds)] } : {})
      page.value = 1
    }

    function resetQuery(): void {
      Object.assign(query, { keyword: '', floorId: 'all', status: 'all', gateIds: [] })
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

    function validateFloor(input: SeatFloorWriteInput): SeatFloorValidationResult {
      return validateSeatFloorInput(input, floors.value)
    }

    function validateZone(input: SeatZoneWriteInput, excludedId?: string): SeatZoneValidationResult {
      return validateSeatZoneInput(input, zones.value, floors.value, ticketGates.value, excludedId)
    }

    function zoneGateIds(zoneCode: string): string[] {
      return [...(gateIdsByZone.value.get(zoneCode) ?? [])]
        .sort((first, second) => (gateById.value.get(first)?.code ?? first).localeCompare(gateById.value.get(second)?.code ?? second, 'zh-CN', { numeric: true }))
    }

    function matchingZoneCount(floorId: string): number {
      return filteredZones.value.filter((item) => item.floorId === floorId).length
    }

    function totalZoneCount(floorId: string): number {
      return zones.value.filter((item) => item.floorId === floorId).length
    }

    function nextSortOrder(floorId: string): number {
      return zones.value.filter((item) => item.floorId === floorId).reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1
    }

    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        applySnapshot(await service.load())
        return true
      } catch (cause) {
        error.value = message(cause)
        return false
      } finally {
        isLoading.value = false
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
        const floor = await service.createFloor(sanitizeSeatFloorInput(input))
        floors.value = sortSeatFloors([...floors.value, floor])
        return floor
      } catch (cause) {
        error.value = message(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function removeFloor(id: string): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        await service.removeFloor(id)
        floors.value = floors.value.filter((item) => item.id !== id)
        if (query.floorId === id) resetQuery()
        return true
      } catch (cause) {
        error.value = message(cause)
        return false
      } finally {
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
        const snapshot = await service.createZone(sanitizeSeatZoneInput(input))
        applySnapshot(snapshot)
        return zones.value.find((item) => item.code === sanitizeSeatZoneInput(input).code) ?? null
      } catch (cause) {
        error.value = message(cause)
        return null
      } finally {
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
        applySnapshot(await service.updateZone(id, sanitizeSeatZoneInput(input)))
        return zones.value.find((item) => item.id === id) ?? null
      } catch (cause) {
        error.value = message(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function updateStatus(id: string, status: SeatZoneStatus): Promise<SeatZone | null> {
      changingStatusId.value = id
      error.value = null
      try {
        const zone = await service.updateZoneStatus(id, status)
        zones.value = sortSeatZones([...zones.value.filter((item) => item.id !== id), zone], floors.value)
        return zone
      } catch (cause) {
        error.value = message(cause)
        return null
      } finally {
        changingStatusId.value = null
      }
    }

    async function removeZone(id: string): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        applySnapshot(await service.removeZone(id))
        page.value = Math.min(page.value, pageCount.value)
        return true
      } catch (cause) {
        error.value = message(cause)
        return false
      } finally {
        deletingId.value = null
      }
    }

    function resetError(): void {
      error.value = null
    }

    return {
      floors, zones, bindings, ticketGates, gateById, query, page, pageSize,
      isLoading, isSaving, deletingId, changingStatusId, error,
      filteredZones, total, pageCount, currentPage, paginatedZones,
      setQuery, resetQuery, setPage, setPageSize, validateFloor, validateZone,
      zoneGateIds, matchingZoneCount, totalZoneCount, nextSortOrder,
      load, createFloor, removeFloor, createZone, updateZone, updateStatus, removeZone, resetError,
    }
  })
}

export const useSeatPlanningStore = createSeatPlanningStore(seatPlanningService)
