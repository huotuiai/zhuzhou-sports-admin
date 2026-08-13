import type { VenueSeat, VenueSeatQuery, VenueSeatService, VenueSeatValidationResult, VenueSeatWriteInput } from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { sanitizeVenueSeatInput, sortVenueSeats, validateVenueSeatInput, venueSeatService } from '../services/venue-seat-service'

function message(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function includes(source: string, keyword: string): boolean {
  return source.normalize('NFKC').toLocaleLowerCase('zh-CN').includes(keyword)
}

export function createVenueSeatStore(service: VenueSeatService, storeId = 'venue-seat') {
  return defineStore(storeId, () => {
    const records = ref<VenueSeat[]>([])
    const query = reactive<VenueSeatQuery>({ keyword: '', type: 'all', status: 'all' })
    const page = ref(1)
    const pageSize = ref(10)
    const isLoading = ref(false)
    const isSaving = ref(false)
    const deletingId = ref<string | null>(null)
    const error = ref<string | null>(null)

    const filteredRecords = computed(() => {
      const keyword = query.keyword.trim().normalize('NFKC').toLocaleLowerCase('zh-CN')
      return records.value.filter((item) => {
        if (keyword && ![item.code, item.venueArea, item.section, item.rowNumber, item.seatNumber].some((value) => includes(value, keyword))) return false
        if (query.type !== 'all' && item.type !== query.type) return false
        if (query.status !== 'all' && item.status !== query.status) return false
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

    function setQuery(patch: Partial<VenueSeatQuery>): void { Object.assign(query, patch); page.value = 1 }
    function resetQuery(): void { Object.assign(query, { keyword: '', type: 'all', status: 'all' }); page.value = 1 }
    function setPage(value: number): void { if (Number.isFinite(value)) page.value = Math.min(Math.max(Math.trunc(value), 1), pageCount.value) }
    function setPageSize(value: number): void { if (Number.isInteger(value) && value > 0) { pageSize.value = value; page.value = 1 } }
    function validate(input: VenueSeatWriteInput, excludedId?: string): VenueSeatValidationResult { return validateVenueSeatInput(input, records.value, excludedId) }
    async function load(): Promise<boolean> { isLoading.value = true; error.value = null; try { records.value = await service.list(); return true } catch (cause) { error.value = message(cause); return false } finally { isLoading.value = false } }
    async function create(input: VenueSeatWriteInput): Promise<VenueSeat | null> { const result = validate(input); if (!result.valid) { error.value = result.issues[0]!.message; return null }; isSaving.value = true; error.value = null; try { const record = await service.create(sanitizeVenueSeatInput(input)); records.value = sortVenueSeats([...records.value, record]); return record } catch (cause) { error.value = message(cause); return null } finally { isSaving.value = false } }
    async function update(id: string, input: VenueSeatWriteInput): Promise<VenueSeat | null> { const result = validate(input, id); if (!result.valid) { error.value = result.issues[0]!.message; return null }; isSaving.value = true; error.value = null; try { const record = await service.update(id, sanitizeVenueSeatInput(input)); records.value = sortVenueSeats([...records.value.filter((item) => item.id !== id), record]); return record } catch (cause) { error.value = message(cause); return null } finally { isSaving.value = false } }
    async function remove(id: string): Promise<boolean> { deletingId.value = id; error.value = null; try { await service.remove(id); records.value = records.value.filter((item) => item.id !== id); page.value = Math.min(page.value, pageCount.value); return true } catch (cause) { error.value = message(cause); return false } finally { deletingId.value = null } }
    function resetError(): void { error.value = null }

    return { records, query, page, pageSize, isLoading, isSaving, deletingId, error, filteredRecords, total, pageCount, currentPage, paginatedRecords, setQuery, resetQuery, setPage, setPageSize, validate, load, create, update, remove, resetError }
  })
}

export const useVenueSeatStore = createVenueSeatStore(venueSeatService)
