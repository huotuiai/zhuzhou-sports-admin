import type { TicketGate, TicketGateQuery, TicketGateService, TicketGateValidationResult, TicketGateWriteInput } from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { sanitizeTicketGateInput, sortTicketGates, ticketGateService, validateTicketGateInput } from '../services/ticket-gate-service'

const PAGE_SIZE = 10

function message(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function includes(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword)
}

export function createTicketGateStore(service: TicketGateService, storeId = 'ticket-gate') {
  return defineStore(storeId, () => {
    const records = ref<TicketGate[]>([])
    const query = reactive<TicketGateQuery>({ keyword: '', direction: 'all', status: 'all' })
    const page = ref(1)
    const pageSize = ref(PAGE_SIZE)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const filteredRecords = computed(() => {
      const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      return records.value.filter((item) => {
        if (keyword && ![item.name, item.code, item.venueArea, item.location].some((value) => includes(value, keyword))) return false
        if (query.direction !== 'all' && item.direction !== query.direction) return false
        if (query.status === 'enabled' && !item.enabled) return false
        if (query.status === 'disabled' && item.enabled) return false
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
      Object.assign(query, { keyword: '', direction: 'all', status: 'all' })
      page.value = 1
    }
    function setPage(value: number): void {
      if (Number.isFinite(value)) page.value = Math.min(Math.max(Math.trunc(value), 1), pageCount.value)
    }
    function setPageSize(value: number): void {
      if (Number.isInteger(value) && value > 0) { pageSize.value = value; page.value = 1 }
    }
    function validate(input: TicketGateWriteInput, excludedId?: string): TicketGateValidationResult {
      return validateTicketGateInput(input, records.value, excludedId)
    }
    async function load(): Promise<boolean> {
      isLoading.value = true; error.value = null
      try { records.value = await service.list(); return true } catch (cause) { error.value = message(cause); return false } finally { isLoading.value = false }
    }
    async function create(input: TicketGateWriteInput): Promise<TicketGate | null> {
      const result = validate(input)
      if (!result.valid) { error.value = result.issues[0]!.message; return null }
      isSaving.value = true; error.value = null
      try { const record = await service.create(sanitizeTicketGateInput(input)); records.value = sortTicketGates([...records.value, record]); return record } catch (cause) { error.value = message(cause); return null } finally { isSaving.value = false }
    }
    async function update(id: string, input: TicketGateWriteInput): Promise<TicketGate | null> {
      const result = validate(input, id)
      if (!result.valid) { error.value = result.issues[0]!.message; return null }
      isSaving.value = true; error.value = null
      try { const record = await service.update(id, sanitizeTicketGateInput(input)); records.value = sortTicketGates([...records.value.filter((item) => item.id !== id), record]); return record } catch (cause) { error.value = message(cause); return null } finally { isSaving.value = false }
    }
    async function remove(id: string): Promise<boolean> {
      deletingId.value = id; error.value = null
      try { await service.remove(id); records.value = records.value.filter((item) => item.id !== id); page.value = Math.min(page.value, pageCount.value); return true } catch (cause) { error.value = message(cause); return false } finally { deletingId.value = null }
    }
    function resetError(): void { error.value = null }

    return { records, query, page, pageSize, isLoading, isSaving, deletingId, error, filteredRecords, total, pageCount, currentPage, paginatedRecords, setQuery, resetQuery, setPage, setPageSize, validate, load, create, update, remove, resetError }
  })
}

export const useTicketGateStore = createTicketGateStore(ticketGateService)
