import type {
  OperationLog,
  OperationLogExportFile,
  OperationLogQuery,
  OperationLogService,
} from '../types'
import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { operationLogService } from '../services/operation-log-service'

export const OPERATION_LOG_PAGE_SIZE = 20

export const DEFAULT_OPERATION_LOG_QUERY: Readonly<OperationLogQuery> = {
  keyword: '',
  module: '',
  action: '',
  result: 'all',
  from: '',
  to: '',
}

function normalizedQuery(query: OperationLogQuery): OperationLogQuery {
  return {
    ...query,
    keyword: query.keyword.trim().normalize('NFKC'),
    module: query.module.trim().normalize('NFKC'),
    action: query.action.trim().normalize('NFKC'),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '操作日志加载失败，请稍后重试'
}

export function validateOperationLogQuery(query: OperationLogQuery): string | null {
  if (query.from && query.to && query.from > query.to) return '开始日期不能晚于结束日期'
  return null
}

export function createOperationLogStore(
  service: OperationLogService,
  storeId = 'operation-log',
) {
  return defineStore(storeId, () => {
    const logs = ref<OperationLog[]>([])
    const query = reactive<OperationLogQuery>({ ...DEFAULT_OPERATION_LOG_QUERY })
    const page = ref(1)
    const pageSize = ref(OPERATION_LOG_PAGE_SIZE)
    const total = ref(0)
    const initialized = ref(false)
    const isLoading = ref(false)
    const isExporting = ref(false)
    const error = ref<string | null>(null)
    const queryError = ref<string | null>(null)
    let initializePromise: Promise<boolean> | null = null

    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

    function applyPage(result: Awaited<ReturnType<OperationLogService['listLogs']>>): void {
      logs.value = result.logs
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
    }

    async function loadPage(nextQuery: OperationLogQuery, nextPage: number): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        const result = await service.listLogs(nextQuery, nextPage, pageSize.value)
        applyPage(result)
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally {
        isLoading.value = false
      }
    }

    async function initialize(force = false): Promise<boolean> {
      if (initialized.value && !force) return true
      if (initializePromise) return initializePromise
      initializePromise = loadPage({ ...query }, page.value).then((loaded) => {
        if (loaded) initialized.value = true
        return loaded
      }).finally(() => {
        initializePromise = null
      })
      return initializePromise
    }

    async function queryLogs(nextQuery: OperationLogQuery): Promise<boolean> {
      const next = normalizedQuery(nextQuery)
      const validation = validateOperationLogQuery(next)
      queryError.value = validation
      if (validation) return false
      const loaded = await loadPage(next, 1)
      if (loaded) Object.assign(query, next)
      return loaded
    }

    async function resetQuery(): Promise<boolean> {
      const loaded = await queryLogs({ ...DEFAULT_OPERATION_LOG_QUERY })
      if (loaded) queryError.value = null
      return loaded
    }

    async function changePage(nextPage: number): Promise<boolean> {
      const normalized = Number.isFinite(nextPage) ? Math.trunc(nextPage) : 1
      const target = Math.min(Math.max(1, normalized), pageCount.value)
      return loadPage({ ...query }, target)
    }

    async function exportLogs(): Promise<OperationLogExportFile | null> {
      if (isExporting.value) return null
      isExporting.value = true
      error.value = null
      try {
        return await service.exportLogs({ ...query })
      }
      catch (cause) {
        error.value = errorMessage(cause)
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
      logs,
      query,
      page,
      pageSize,
      total,
      pageCount,
      initialized,
      isLoading,
      isExporting,
      error,
      queryError,
      initialize,
      queryLogs,
      resetQuery,
      changePage,
      exportLogs,
      resetError,
    }
  })
}

export const useOperationLogStore = createOperationLogStore(operationLogService)
