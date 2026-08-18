import type {
  SeatZoneGateBinding,
  TicketGate,
  TicketGateQuery,
  TicketGateRelationService,
  TicketGateService,
  TicketGateStatusInput,
  TicketGateValidationResult,
  TicketGateWriteInput,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { ticketGateRelationService } from '../services/ticket-gate-relation-service'
import { sanitizeTicketGateInput, sortTicketGates, ticketGateService, validateTicketGateInput } from '../services/ticket-gate-service'

const PAGE_SIZE = 20

function message(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function includes(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword)
}

export function createTicketGateStore(
  service: TicketGateService,
  relationService: TicketGateRelationService = ticketGateRelationService,
  storeId = 'ticket-gate',
) {
  return defineStore(storeId, () => {
    const records = ref<TicketGate[]>([])
    const seatZoneBindings = ref<SeatZoneGateBinding[]>([])
    const query = reactive<TicketGateQuery>({ keyword: '', status: 'all', floor: 'all' })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const filteredRecords = computed(() => {
      const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      return records.value.filter((item) => {
        if (keyword && ![item.code, item.name].some((value) => includes(value, keyword))) return false
        if (query.status !== 'all' && item.status !== query.status) return false
        if (query.floor !== 'all' && item.floor !== query.floor) return false
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

    function setQuery(patch: Partial<TicketGateQuery>): void {
      Object.assign(query, patch)
      page.value = 1
    }

    function resetQuery(): void {
      Object.assign(query, { keyword: '', status: 'all', floor: 'all' })
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

    function validate(input: TicketGateWriteInput, excludedId?: string): TicketGateValidationResult {
      return validateTicketGateInput(input, records.value, excludedId)
    }

    function coveredZones(gateId: string): string[] {
      return seatZoneBindings.value
        .filter((item) => item.gateId === gateId)
        .map((item) => item.zoneCode)
        .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    }

    async function countSeatZoneBindings(gateId: string): Promise<number> {
      try {
        return await relationService.countSeatZoneBindings(gateId)
      } catch (cause) {
        error.value = message(cause)
        return -1
      }
    }

    async function load(): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        const [nextRecords, nextBindings] = await Promise.all([
          service.list(),
          relationService.listSeatZoneBindings(),
        ])
        records.value = nextRecords
        seatZoneBindings.value = nextBindings
        return true
      } catch (cause) {
        error.value = message(cause)
        return false
      } finally {
        isLoading.value = false
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
        records.value = sortTicketGates([...records.value, record])
        return record
      } catch (cause) {
        error.value = message(cause)
        return null
      } finally {
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
        records.value = sortTicketGates([...records.value.filter((item) => item.id !== id), record])
        return record
      } catch (cause) {
        error.value = message(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function updateStatus(id: string, input: TicketGateStatusInput): Promise<TicketGate | null> {
      isSaving.value = true
      error.value = null
      try {
        const record = await service.updateStatus(id, input)
        records.value = sortTicketGates([...records.value.filter((item) => item.id !== id), record])
        return record
      } catch (cause) {
        error.value = message(cause)
        return null
      } finally {
        isSaving.value = false
      }
    }

    async function remove(id: string): Promise<boolean> {
      deletingId.value = id
      error.value = null
      try {
        const bindingCount = await relationService.countSeatZoneBindings(id)
        if (bindingCount > 0) throw new Error(`该检票口已绑定 ${bindingCount} 个座位分区，请先在座位规划管理中移除绑定`)
        await service.remove(id)
        await relationService.cleanupGate(id)
        records.value = records.value.filter((item) => item.id !== id)
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
      records,
      seatZoneBindings,
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
      validate,
      coveredZones,
      countSeatZoneBindings,
      load,
      create,
      update,
      updateStatus,
      remove,
      resetError,
    }
  })
}

export const useTicketGateStore = createTicketGateStore(ticketGateService)
