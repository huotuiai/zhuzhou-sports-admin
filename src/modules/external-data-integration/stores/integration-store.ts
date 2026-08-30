import { ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  IntegrationService,
  IntegrationSource,
  IntegrationSourceQuery,
  IntegrationSourceReference,
  IntegrationSourceWriteInput,
  IntegrationSyncLog,
  IntegrationSyncLogQuery,
  IntegrationSyncResult,
} from '../types'
import { integrationService } from '../services/integration-service'
import { isWritableIntegrationSourceType } from '../types'

export const INTEGRATION_SOURCE_PAGE_SIZE = 20
export const INTEGRATION_LOG_PAGE_SIZE = 20

export const DEFAULT_INTEGRATION_SOURCE_QUERY: IntegrationSourceQuery = {
  keyword: '',
  sourceType: 'all',
}

export const DEFAULT_INTEGRATION_LOG_QUERY: IntegrationSyncLogQuery = {
  sourceId: '',
  result: 'all',
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

function sourceWriteInput(source: IntegrationSource, enabled = source.enabled): IntegrationSourceWriteInput {
  return {
    name: source.name,
    sourceType: source.sourceType,
    apiUrl: source.apiUrl,
    apiKey: '',
    intervalMinutes: source.intervalMinutes,
    enabled,
    remark: source.remark,
  }
}

export function createIntegrationStore(service: IntegrationService, storeId = 'external-data-integration') {
  return defineStore(storeId, () => {
    const sources = ref<IntegrationSource[]>([])
    const total = ref(0)
    const page = ref(1)
    const pageSize = ref(INTEGRATION_SOURCE_PAGE_SIZE)
    const query = ref<IntegrationSourceQuery>({ ...DEFAULT_INTEGRATION_SOURCE_QUERY })
    const sourceReferences = ref<Record<string, IntegrationSourceReference>>({})
    const logs = ref<IntegrationSyncLog[]>([])
    const logTotal = ref(0)
    const logPage = ref(1)
    const logPageSize = ref(INTEGRATION_LOG_PAGE_SIZE)
    const logQuery = ref<IntegrationSyncLogQuery>({ ...DEFAULT_INTEGRATION_LOG_QUERY })
    const logOpen = ref(false)
    const isInitialized = ref(false)
    const isLoading = ref(false)
    const isDetailLoading = ref(false)
    const isSaving = ref(false)
    const isLogsLoading = ref(false)
    const syncingIds = ref<Set<string>>(new Set())
    const updatingIds = ref<Set<string>>(new Set())
    const error = ref<string | null>(null)
    const detailError = ref<string | null>(null)
    const mutationError = ref<string | null>(null)
    const logsError = ref<string | null>(null)
    let sourceRequest = 0
    let detailRequest = 0
    let logRequest = 0
    let referenceRequest = 0

    function cacheSources(items: readonly IntegrationSource[]): void {
      const next = { ...sourceReferences.value }
      for (const source of items) next[source.id] = { code: source.code, name: source.name }
      sourceReferences.value = next
    }

    async function loadSources(targetPage = page.value, targetPageSize = pageSize.value): Promise<boolean> {
      const request = ++sourceRequest
      isLoading.value = true
      error.value = null
      try {
        const result = await service.listSources(query.value, targetPage, targetPageSize)
        if (request !== sourceRequest) return false
        sources.value = result.items
        total.value = result.total
        page.value = result.page
        pageSize.value = result.pageSize
        cacheSources(result.items)
        isInitialized.value = true
        return true
      }
      catch (cause) {
        if (request === sourceRequest) error.value = errorMessage(cause)
        return false
      }
      finally {
        if (request === sourceRequest) isLoading.value = false
      }
    }

    async function refresh(): Promise<boolean> {
      const loaded = await loadSources(page.value, pageSize.value)
      if (!loaded) return false
      const validPage = Math.max(1, Math.ceil(total.value / pageSize.value))
      return page.value <= validPage ? true : loadSources(validPage, pageSize.value)
    }

    async function initialize(force = false): Promise<boolean> {
      if (isInitialized.value && !force) return true
      return force ? refresh() : loadSources(1, pageSize.value)
    }

    async function querySources(nextQuery: IntegrationSourceQuery): Promise<boolean> {
      query.value = { ...nextQuery }
      return loadSources(1, pageSize.value)
    }

    async function resetQuery(): Promise<boolean> {
      query.value = { ...DEFAULT_INTEGRATION_SOURCE_QUERY }
      return loadSources(1, pageSize.value)
    }

    async function changePage(nextPage: number): Promise<boolean> {
      return loadSources(nextPage, pageSize.value)
    }

    async function changePageSize(nextPageSize: number): Promise<boolean> {
      return loadSources(1, nextPageSize)
    }

    async function getSource(id: string): Promise<IntegrationSource | null> {
      const request = ++detailRequest
      isDetailLoading.value = true
      detailError.value = null
      try {
        const source = await service.getSource(id)
        if (request !== detailRequest) return null
        cacheSources([source])
        return source
      }
      catch (cause) {
        if (request === detailRequest) detailError.value = errorMessage(cause)
        return null
      }
      finally {
        if (request === detailRequest) isDetailLoading.value = false
      }
    }

    async function createSource(input: IntegrationSourceWriteInput): Promise<IntegrationSource | null> {
      isSaving.value = true
      mutationError.value = null
      try {
        const source = await service.createSource(input)
        cacheSources([source])
        await loadSources(1, pageSize.value)
        return source
      }
      catch (cause) {
        mutationError.value = errorMessage(cause)
        return null
      }
      finally { isSaving.value = false }
    }

    async function updateSource(id: string, input: IntegrationSourceWriteInput): Promise<IntegrationSource | null> {
      isSaving.value = true
      mutationError.value = null
      try {
        const source = await service.updateSource(id, input)
        cacheSources([source])
        await loadSources(page.value, pageSize.value)
        return source
      }
      catch (cause) {
        mutationError.value = errorMessage(cause)
        return null
      }
      finally { isSaving.value = false }
    }

    function setIdBusy(target: typeof updatingIds, id: string, busy: boolean): void {
      const next = new Set(target.value)
      if (busy) next.add(id)
      else next.delete(id)
      target.value = next
    }

    async function toggleSource(id: string): Promise<IntegrationSource | null> {
      if (updatingIds.value.has(id)) return null
      setIdBusy(updatingIds, id, true)
      mutationError.value = null
      try {
        const latest = await service.getSource(id)
        if (!isWritableIntegrationSourceType(latest.sourceType)) {
          throw new Error('存量类型仅支持只读展示，不能修改启停状态。')
        }
        const updated = await service.updateSource(id, sourceWriteInput(latest, !latest.enabled))
        cacheSources([updated])
        await loadSources(page.value, pageSize.value)
        return updated
      }
      catch (cause) {
        mutationError.value = errorMessage(cause)
        return null
      }
      finally { setIdBusy(updatingIds, id, false) }
    }

    async function syncSource(id: string): Promise<IntegrationSyncResult | null> {
      if (syncingIds.value.has(id)) return null
      const source = sources.value.find(item => item.id === id)
      if (source && !source.enabled) {
        mutationError.value = '停用中的对接源不可同步。'
        return null
      }
      setIdBusy(syncingIds, id, true)
      mutationError.value = null
      try {
        const result = await service.syncSource(id)
        await loadSources(page.value, pageSize.value)
        if (logOpen.value) await loadLogs(logPage.value)
        if (result.result === 'fail') mutationError.value = result.summary
        return result
      }
      catch (cause) {
        mutationError.value = errorMessage(cause)
        return null
      }
      finally { setIdBusy(syncingIds, id, false) }
    }

    async function refreshSourceReferences(): Promise<boolean> {
      const request = ++referenceRequest
      try {
        let currentPage = 1
        let result = await service.listSources(DEFAULT_INTEGRATION_SOURCE_QUERY, currentPage, 100)
        const items = [...result.items]
        while (currentPage * result.pageSize < result.total) {
          currentPage += 1
          result = await service.listSources(DEFAULT_INTEGRATION_SOURCE_QUERY, currentPage, 100)
          items.push(...result.items)
        }
        if (request !== referenceRequest) return false
        cacheSources(items)
        return true
      }
      catch {
        return false
      }
    }

    async function loadLogs(targetPage = logPage.value, targetPageSize = logPageSize.value): Promise<boolean> {
      const request = ++logRequest
      isLogsLoading.value = true
      logsError.value = null
      try {
        const result = await service.listSyncLogs(logQuery.value, targetPage, targetPageSize)
        if (request !== logRequest) return false
        logs.value = result.items
        logTotal.value = result.total
        logPage.value = result.page
        logPageSize.value = result.pageSize
        return true
      }
      catch (cause) {
        if (request === logRequest) logsError.value = errorMessage(cause)
        return false
      }
      finally {
        if (request === logRequest) isLogsLoading.value = false
      }
    }

    async function openLogs(): Promise<boolean> {
      logOpen.value = true
      void refreshSourceReferences()
      return loadLogs(1)
    }

    function closeLogs(): void {
      logOpen.value = false
      logRequest += 1
      isLogsLoading.value = false
    }

    async function queryLogs(nextQuery: IntegrationSyncLogQuery): Promise<boolean> {
      logQuery.value = { ...nextQuery }
      return loadLogs(1)
    }

    async function changeLogPage(nextPage: number): Promise<boolean> {
      return loadLogs(nextPage, logPageSize.value)
    }

    async function changeLogPageSize(nextPageSize: number): Promise<boolean> {
      if (!Number.isInteger(nextPageSize) || nextPageSize <= 0) return false
      return loadLogs(1, nextPageSize)
    }

    function sourceLabel(sourceId: string): string {
      const reference = sourceReferences.value[sourceId]
      return reference ? `${reference.code} ${reference.name}` : `对接源 #${sourceId}`
    }

    return {
      sources,
      total,
      page,
      pageSize,
      query,
      sourceReferences,
      logs,
      logTotal,
      logPage,
      logPageSize,
      logQuery,
      logOpen,
      isInitialized,
      isLoading,
      isDetailLoading,
      isSaving,
      isLogsLoading,
      syncingIds,
      updatingIds,
      error,
      detailError,
      mutationError,
      logsError,
      initialize,
      refresh,
      loadSources,
      querySources,
      resetQuery,
      changePage,
      changePageSize,
      getSource,
      createSource,
      updateSource,
      toggleSource,
      syncSource,
      openLogs,
      closeLogs,
      queryLogs,
      changeLogPage,
      changeLogPageSize,
      loadLogs,
      sourceLabel,
    }
  })
}

export const useIntegrationStore = createIntegrationStore(integrationService)
