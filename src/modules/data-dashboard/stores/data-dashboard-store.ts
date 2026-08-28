import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  DashboardExportFile,
  DashboardMetricDimension,
  DashboardMetricGroup,
  DashboardService,
  DashboardSnapshot,
  DashboardStatsQuery,
  DashboardVrSyncResult,
  MetricDetailPage,
} from '../types'
import { dashboardService } from '../services/dashboard-service'

export const DASHBOARD_DETAIL_PAGE_SIZE = 20

function emptyDetailPage(): MetricDetailPage {
  return { items: [], total: 0, page: 1, pageSize: DASHBOARD_DETAIL_PAGE_SIZE }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '数据加载失败，请稍后重试'
}

export function createDataDashboardStore(service: DashboardService, storeId = 'data-dashboard') {
  return defineStore(storeId, () => {
    const snapshot = ref<DashboardSnapshot | null>(null)
    const activeGroup = ref<DashboardMetricGroup>('entry')
    const selectedMetricId = ref<string | null>(null)
    const detailDimension = ref<DashboardMetricDimension>('primary')
    const metricDetail = ref<MetricDetailPage>(emptyDetailPage())
    const isLoading = ref(false)
    const isOperationsLoading = ref(false)
    const isTrendLoading = ref(false)
    const isDetailLoading = ref(false)
    const isVrSyncing = ref(false)
    const error = ref<string | null>(null)
    const trendError = ref<string | null>(null)
    const detailError = ref<string | null>(null)
    const vrSyncError = ref<string | null>(null)
    let operationsRequest = 0
    let trendRequest = 0
    let detailRequest = 0

    const selectedMetric = computed(() => snapshot.value?.operations.metrics
      .find(metric => metric.id === selectedMetricId.value) ?? null)
    const visibleMetrics = computed(() => snapshot.value?.operations.metrics
      .filter(metric => metric.group === activeGroup.value) ?? [])
    const metricGroupCounts = computed<Record<DashboardMetricGroup, number>>(() => ({
      entry: snapshot.value?.operations.metrics.filter(metric => metric.group === 'entry').length ?? 0,
      page: snapshot.value?.operations.metrics.filter(metric => metric.group === 'page').length ?? 0,
    }))

    async function load(query: DashboardStatsQuery): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        snapshot.value = await service.loadDashboard(query)
        return true
      }
      catch (cause) {
        error.value = errorMessage(cause)
        return false
      }
      finally { isLoading.value = false }
    }

    async function refreshOperations(query: DashboardStatsQuery): Promise<boolean> {
      if (!snapshot.value) return load(query)
      const request = ++operationsRequest
      isOperationsLoading.value = true
      error.value = null
      try {
        const result = await service.loadOperations(query)
        if (request !== operationsRequest || !snapshot.value) return false
        snapshot.value = {
          ...snapshot.value,
          activities: result.activities,
          operations: result.operations,
          currentDataUpdatedAt: result.operations.updatedAt,
        }
        if (selectedMetricId.value && !selectedMetric.value) closeMetricDetail()
        else if (selectedMetricId.value) await Promise.all([loadMetricTrend(), loadMetricDetail(1)])
        return true
      }
      catch (cause) {
        if (request === operationsRequest) error.value = errorMessage(cause)
        return false
      }
      finally {
        if (request === operationsRequest) isOperationsLoading.value = false
      }
    }

    function setActiveGroup(group: DashboardMetricGroup): void {
      if (activeGroup.value === group) return
      activeGroup.value = group
      closeMetricDetail()
    }

    async function selectMetric(id: string): Promise<void> {
      const metric = snapshot.value?.operations.metrics.find(item => item.id === id)
      if (!metric) return
      selectedMetricId.value = id
      detailDimension.value = 'primary'
      metricDetail.value = emptyDetailPage()
      trendError.value = null
      detailError.value = null
      await Promise.all([loadMetricTrend(), loadMetricDetail(1)])
    }

    function closeMetricDetail(): void {
      trendRequest += 1
      detailRequest += 1
      selectedMetricId.value = null
      detailDimension.value = 'primary'
      metricDetail.value = emptyDetailPage()
      trendError.value = null
      detailError.value = null
      isTrendLoading.value = false
      isDetailLoading.value = false
    }

    function setDetailDimension(dimension: DashboardMetricDimension): void {
      if (dimension === 'secondary' && selectedMetric.value?.secondaryValue === null) return
      detailDimension.value = dimension
    }

    async function loadMetricTrend(): Promise<boolean> {
      const metricId = selectedMetricId.value
      const query = snapshot.value?.operations.query
      if (!metricId || !query) return false
      const request = ++trendRequest
      isTrendLoading.value = true
      trendError.value = null
      try {
        const trend = await service.loadMetricTrend(metricId, query)
        if (request !== trendRequest || selectedMetricId.value !== metricId || !snapshot.value) return false
        const metrics = snapshot.value.operations.metrics.map(metric => metric.id === metricId ? { ...metric, trend } : metric)
        snapshot.value = { ...snapshot.value, operations: { ...snapshot.value.operations, metrics } }
        return true
      }
      catch (cause) {
        if (request === trendRequest) trendError.value = errorMessage(cause)
        return false
      }
      finally {
        if (request === trendRequest) isTrendLoading.value = false
      }
    }

    async function setDetailPage(page: number): Promise<void> {
      await loadMetricDetail(page)
    }

    async function loadMetricDetail(page = metricDetail.value.page): Promise<boolean> {
      const metricId = selectedMetricId.value
      const query = snapshot.value?.operations.query
      if (!metricId || !query) return false
      const request = ++detailRequest
      isDetailLoading.value = true
      detailError.value = null
      try {
        const result = await service.getMetricDetails(metricId, query, page, DASHBOARD_DETAIL_PAGE_SIZE)
        if (request !== detailRequest || selectedMetricId.value !== metricId) return false
        metricDetail.value = result
        return true
      }
      catch (cause) {
        if (request === detailRequest) detailError.value = errorMessage(cause)
        return false
      }
      finally {
        if (request === detailRequest) isDetailLoading.value = false
      }
    }

    async function exportMetricDetails(): Promise<DashboardExportFile | null> {
      const metricId = selectedMetricId.value
      const query = snapshot.value?.operations.query
      if (!metricId || !query) {
        detailError.value = '请先选择要导出的指标'
        return null
      }
      try { return await service.exportMetricDetails(metricId, query) }
      catch (cause) {
        detailError.value = errorMessage(cause)
        return null
      }
    }

    async function syncVrWorks(): Promise<DashboardVrSyncResult | null> {
      if (!snapshot.value || isVrSyncing.value) return null
      isVrSyncing.value = true
      vrSyncError.value = null
      try {
        const result = await service.syncVrWorks()
        const vrWorks = await service.loadVrWorks()
        if (snapshot.value) snapshot.value = { ...snapshot.value, vrWorks }
        if (result.result === 'fail') vrSyncError.value = result.summary
        return result
      }
      catch (cause) {
        vrSyncError.value = errorMessage(cause)
        return null
      }
      finally { isVrSyncing.value = false }
    }

    return {
      snapshot,
      activeGroup,
      selectedMetricId,
      selectedMetric,
      visibleMetrics,
      metricGroupCounts,
      detailDimension,
      metricDetail,
      isLoading,
      isOperationsLoading,
      isTrendLoading,
      isDetailLoading,
      isVrSyncing,
      error,
      trendError,
      detailError,
      vrSyncError,
      load,
      refreshOperations,
      setActiveGroup,
      selectMetric,
      closeMetricDetail,
      setDetailDimension,
      setDetailPage,
      loadMetricTrend,
      loadMetricDetail,
      exportMetricDetails,
      syncVrWorks,
    }
  })
}

export const useDataDashboardStore = createDataDashboardStore(dashboardService)
