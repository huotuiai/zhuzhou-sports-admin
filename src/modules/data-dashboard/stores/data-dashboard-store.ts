import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  DashboardDateRange,
  DashboardMetricDimension,
  DashboardMetricGroup,
  DashboardService,
  DashboardSnapshot,
  DistributionDetailRow,
  MetricDetailPage,
} from '../types'
import { dashboardService } from '../services/dashboard-service'

export const DASHBOARD_DETAIL_PAGE_SIZE = 20
export const DASHBOARD_MAX_EXPORT_ROWS = 50_000

interface SelectedDistribution {
  id: string
  title: string
  sliceKey: string
  sliceLabel: string
}

function emptyDetailPage(): MetricDetailPage {
  return { items: [], total: 0, page: 1, pageSize: DASHBOARD_DETAIL_PAGE_SIZE }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '数据加载失败，请稍后重试'
}

export function createDataDashboardStore(
  service: DashboardService,
  storeId = 'data-dashboard',
) {
  return defineStore(storeId, () => {
    const snapshot = ref<DashboardSnapshot | null>(null)
    const activeGroup = ref<DashboardMetricGroup>('core')
    const selectedMetricId = ref<string | null>(null)
    const detailDimension = ref<DashboardMetricDimension>('primary')
    const metricDetail = ref<MetricDetailPage>(emptyDetailPage())
    const selectedDistribution = ref<SelectedDistribution | null>(null)
    const distributionDetails = ref<DistributionDetailRow[]>([])
    const syncingVrIds = ref<Set<string>>(new Set())
    const syncErrors = ref<Record<string, string>>({})
    const isLoading = ref(false)
    const isOperationsLoading = ref(false)
    const isDetailLoading = ref(false)
    const isDistributionLoading = ref(false)
    const error = ref<string | null>(null)
    const detailError = ref<string | null>(null)
    const distributionError = ref<string | null>(null)
    let operationsRequest = 0
    let detailRequest = 0

    const selectedMetric = computed(() => snapshot.value?.operations.metrics
      .find((metric) => metric.id === selectedMetricId.value) ?? null)
    const visibleMetrics = computed(() => snapshot.value?.operations.metrics
      .filter((metric) => metric.group === activeGroup.value) ?? [])

    async function load(range: DashboardDateRange): Promise<boolean> {
      isLoading.value = true
      error.value = null
      try {
        snapshot.value = await service.loadDashboard(range)
        return true
      } catch (cause) {
        error.value = errorMessage(cause)
        return false
      } finally {
        isLoading.value = false
      }
    }

    async function refreshOperations(range: DashboardDateRange): Promise<boolean> {
      if (!snapshot.value) return load(range)
      const request = ++operationsRequest
      isOperationsLoading.value = true
      error.value = null
      try {
        const operations = await service.loadOperations(range)
        if (request !== operationsRequest || !snapshot.value) return false
        snapshot.value = { ...snapshot.value, operations }
        if (selectedMetricId.value) await loadMetricDetail(1)
        return true
      } catch (cause) {
        if (request === operationsRequest) error.value = errorMessage(cause)
        return false
      } finally {
        if (request === operationsRequest) isOperationsLoading.value = false
      }
    }

    function setActiveGroup(group: DashboardMetricGroup): void {
      if (activeGroup.value === group) return
      activeGroup.value = group
      closeMetricDetail()
    }

    async function selectMetric(id: string): Promise<void> {
      const metric = snapshot.value?.operations.metrics.find((item) => item.id === id)
      if (!metric) return
      selectedMetricId.value = id
      detailDimension.value = 'primary'
      metricDetail.value = emptyDetailPage()
      detailError.value = null
      await loadMetricDetail(1)
    }

    function closeMetricDetail(): void {
      detailRequest += 1
      selectedMetricId.value = null
      detailDimension.value = 'primary'
      metricDetail.value = emptyDetailPage()
      detailError.value = null
      isDetailLoading.value = false
    }

    async function setDetailDimension(dimension: DashboardMetricDimension): Promise<void> {
      if (dimension === 'secondary' && selectedMetric.value?.secondaryValue === null) return
      detailDimension.value = dimension
      await loadMetricDetail(1)
    }

    async function setDetailPage(page: number): Promise<void> {
      await loadMetricDetail(page)
    }

    async function loadMetricDetail(page = metricDetail.value.page): Promise<boolean> {
      const metricId = selectedMetricId.value
      const range = snapshot.value?.operations.range
      if (!metricId || !range) return false
      const request = ++detailRequest
      isDetailLoading.value = true
      detailError.value = null
      try {
        const nextPage = await service.getMetricDetails(
          metricId,
          detailDimension.value,
          range,
          page,
          DASHBOARD_DETAIL_PAGE_SIZE,
        )
        if (request !== detailRequest || selectedMetricId.value !== metricId) return false
        metricDetail.value = nextPage
        return true
      } catch (cause) {
        if (request === detailRequest) detailError.value = errorMessage(cause)
        return false
      } finally {
        if (request === detailRequest) isDetailLoading.value = false
      }
    }

    async function readMetricExport() {
      const metricId = selectedMetricId.value
      const range = snapshot.value?.operations.range
      if (!metricId || !range) throw new Error('请先选择要导出的指标')
      const rows = await service.getAllMetricDetails(metricId, detailDimension.value, range)
      if (rows.length > DASHBOARD_MAX_EXPORT_ROWS) throw new Error('导出数据超过 5 万条，请缩小时间范围')
      return rows
    }

    async function openDistributionDetail(selection: SelectedDistribution): Promise<void> {
      selectedDistribution.value = selection
      distributionDetails.value = []
      distributionError.value = null
      isDistributionLoading.value = true
      try {
        distributionDetails.value = await service.getDistributionDetails(selection.id, selection.sliceKey)
      } catch (cause) {
        distributionError.value = errorMessage(cause)
      } finally {
        isDistributionLoading.value = false
      }
    }

    function closeDistributionDetail(): void {
      selectedDistribution.value = null
      distributionDetails.value = []
      distributionError.value = null
    }

    async function retryDistributionDetail(): Promise<void> {
      if (selectedDistribution.value) await openDistributionDetail(selectedDistribution.value)
    }

    async function syncVrWork(id: string): Promise<boolean> {
      if (!snapshot.value || syncingVrIds.value.has(id)) return false
      syncingVrIds.value = new Set(syncingVrIds.value).add(id)
      const nextErrors = { ...syncErrors.value }
      delete nextErrors[id]
      syncErrors.value = nextErrors
      try {
        const updated = await service.syncVrWork(id)
        if (!snapshot.value) return false
        const works = snapshot.value.vrWorks
          .map((work) => work.id === id ? updated : work)
          .sort((left, right) => right.pv - left.pv)
          .map((work, index) => ({ ...work, rank: index + 1 }))
        snapshot.value = { ...snapshot.value, vrWorks: works }
        return true
      } catch (cause) {
        syncErrors.value = { ...syncErrors.value, [id]: errorMessage(cause) }
        return false
      } finally {
        const nextIds = new Set(syncingVrIds.value)
        nextIds.delete(id)
        syncingVrIds.value = nextIds
      }
    }

    return {
      snapshot,
      activeGroup,
      selectedMetricId,
      selectedMetric,
      visibleMetrics,
      detailDimension,
      metricDetail,
      selectedDistribution,
      distributionDetails,
      syncingVrIds,
      syncErrors,
      isLoading,
      isOperationsLoading,
      isDetailLoading,
      isDistributionLoading,
      error,
      detailError,
      distributionError,
      load,
      refreshOperations,
      setActiveGroup,
      selectMetric,
      closeMetricDetail,
      setDetailDimension,
      setDetailPage,
      loadMetricDetail,
      readMetricExport,
      openDistributionDetail,
      closeDistributionDetail,
      retryDistributionDetail,
      syncVrWork,
    }
  })
}

export const useDataDashboardStore = createDataDashboardStore(dashboardService)
