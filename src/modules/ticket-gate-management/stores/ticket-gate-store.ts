import type {
  TicketGate,
  TicketGateFloorOption,
  TicketGatePage,
  TicketGateQuery,
  TicketGateService,
  TicketGateStatusInput,
  TicketGateValidationResult,
  TicketGateWriteInput,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  sanitizeTicketGateInput,
  ticketGateService,
  validateTicketGateInput,
} from '../services/ticket-gate-service'

const PAGE_SIZE = 20

export const DEFAULT_TICKET_GATE_QUERY: Readonly<TicketGateQuery> = {
  keyword: '',
  status: 'all',
  floorId: 'all',
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试'
}

function normalizeQuery(query: TicketGateQuery): TicketGateQuery {
  return {
    keyword: query.keyword.trim().normalize('NFKC'),
    status: query.status,
    floorId: query.floorId,
  }
}

function cloneFloor(floor: TicketGateFloorOption): TicketGateFloorOption {
  return { ...floor }
}

export function createTicketGateStore(service: TicketGateService, storeId = 'ticket-gate') {
  return defineStore(storeId, () => {
    const records = ref<TicketGate[]>([])
    const floors = ref<TicketGateFloorOption[]>([])
    const query = reactive<TicketGateQuery>({ ...DEFAULT_TICKET_GATE_QUERY })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const total = ref(0)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const isExporting = ref(false)
    const detailLoadingId = ref<string | null>(null)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, pageSize.value))))
    const currentPage = computed(() => Math.min(Math.max(page.value, 1), pageCount.value))
    const filteredRecords = computed(() => records.value)
    const paginatedRecords = computed(() => records.value)

    function applyPage(result: TicketGatePage): void {
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
      isLoading.value = true
      error.value = null
      try {
        const [nextFloors, nextPage] = await Promise.all([
          service.listFloors(),
          service.listPage(page.value, pageSize.value, normalizeQuery(query)),
        ])
        floors.value = nextFloors.map(cloneFloor)
        applyPage(nextPage)
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

    async function setQuery(patch: Partial<TicketGateQuery>): Promise<boolean> {
      Object.assign(query, normalizeQuery({ ...query, ...patch }))
      page.value = 1
      return loadPage(1)
    }

    async function resetQuery(): Promise<boolean> {
      Object.assign(query, DEFAULT_TICKET_GATE_QUERY)
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

    function validate(input: TicketGateWriteInput, excludedId?: string): TicketGateValidationResult {
      return validateTicketGateInput(input, floors.value, records.value, excludedId)
    }

    async function get(id: string): Promise<TicketGate | null> {
      detailLoadingId.value = id
      error.value = null
      try {
        return await service.get(id)
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        detailLoadingId.value = null
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

    async function create(input: TicketGateWriteInput): Promise<TicketGate | null> {
      const result = validate(input)
      if (!result.valid) {
        error.value = result.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.create(sanitizeTicketGateInput(input))
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

    async function update(id: string, input: TicketGateWriteInput): Promise<TicketGate | null> {
      const result = validate(input, id)
      if (!result.valid) {
        error.value = result.issues[0]!.message
        return null
      }
      isSaving.value = true
      error.value = null
      try {
        const record = await service.update(id, sanitizeTicketGateInput(input))
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

    async function updateStatus(id: string, input: TicketGateStatusInput): Promise<TicketGate | null> {
      isSaving.value = true
      error.value = null
      try {
        const record = await service.updateStatus(id, input)
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

    async function exportCurrent(): Promise<TicketGate[] | null> {
      isExporting.value = true
      error.value = null
      try {
        return await service.list(normalizeQuery(query))
      }
      catch (cause) {
        error.value = message(cause)
        return null
      }
      finally {
        isExporting.value = false
      }
    }

    function resetError(): void {
      error.value = null
    }

    return {
      records,
      floors,
      query,
      page,
      pageSize,
      total,
      isLoading,
      isSaving,
      isExporting,
      detailLoadingId,
      deletingId,
      error,
      pageCount,
      currentPage,
      filteredRecords,
      paginatedRecords,
      load,
      loadPage,
      setQuery,
      resetQuery,
      setPage,
      setPageSize,
      validate,
      get,
      create,
      update,
      updateStatus,
      remove,
      exportCurrent,
      resetError,
    }
  })
}

export const useTicketGateStore = createTicketGateStore(ticketGateService)
