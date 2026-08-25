import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { DashboardMetricDetail, DashboardMetricDimension, DashboardDateRange } from '../types'
import { MockDashboardService, rangeForPreset } from '../services/dashboard-service'
import { createDataDashboardStore, DASHBOARD_MAX_EXPORT_ROWS } from './data-dashboard-store'

const NOW = new Date('2026-08-17T04:00:00.000Z')

class OversizedExportService extends MockDashboardService {
  override async getAllMetricDetails(
    metricId: string,
    dimension: DashboardMetricDimension,
    range: DashboardDateRange,
  ): Promise<DashboardMetricDetail[]> {
    const seed = await super.getAllMetricDetails(metricId, dimension, range)
    return Array.from({ length: DASHBOARD_MAX_EXPORT_ROWS + 1 }, (_, index) => ({
      ...(seed[0] ?? { date: range.start, value: 0, sourceEntry: '测试' }),
      id: `detail-${index}`,
    }))
  }
}

describe('data dashboard store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('refreshes only operations and reloads the selected metric detail', async () => {
    const service = new MockDashboardService({ now: () => NOW, syncDelayMs: 0 })
    const useStore = createDataDashboardStore(service, 'dashboard-refresh-test')
    const store = useStore()
    await store.load(rangeForPreset('last-7-days', NOW))
    const distributions = store.snapshot?.distributions
    const vrWorks = store.snapshot?.vrWorks

    await store.selectMetric('IND-3')
    expect(store.selectedMetric?.id).toBe('IND-3')
    expect(store.metricDetail.total).toBe(7)
    await store.refreshOperations(rangeForPreset('last-30-days', NOW))

    expect(store.snapshot?.distributions).toBe(distributions)
    expect(store.snapshot?.vrWorks).toBe(vrWorks)
    expect(store.metricDetail.total).toBe(30)
    await store.setDetailDimension('secondary')
    expect(store.detailDimension).toBe('secondary')
    expect(store.metricDetail.items).toHaveLength(20)
  })

  it('closes metric details when switching groups and loads distribution details', async () => {
    const useStore = createDataDashboardStore(new MockDashboardService({ now: () => NOW, syncDelayMs: 0 }), 'dashboard-selection-test')
    const store = useStore()
    await store.load(rangeForPreset('last-7-days', NOW))
    await store.selectMetric('IND-3')
    store.setActiveGroup('page')
    expect(store.selectedMetric).toBeNull()
    expect(store.visibleMetrics).toHaveLength(6)

    await store.openDistributionDetail({ id: 'parking-charge', title: '停车收费类型分布', sliceKey: 'free', sliceLabel: '免费停车场' })
    expect(store.distributionDetails).toHaveLength(4)
  })

  it('updates individual VR rows and enforces the export row limit', async () => {
    const syncStore = createDataDashboardStore(new MockDashboardService({ now: () => NOW, syncDelayMs: 0 }), 'dashboard-sync-test')()
    await syncStore.load(rangeForPreset('last-7-days', NOW))
    const before = syncStore.snapshot?.vrWorks.find((work) => work.id === 'vr-1')?.pv ?? 0
    expect(await syncStore.syncVrWork('vr-1')).toBe(true)
    expect(syncStore.snapshot?.vrWorks.find((work) => work.id === 'vr-1')?.pv).toBeGreaterThan(before)

    const exportStore = createDataDashboardStore(new OversizedExportService({ now: () => NOW, syncDelayMs: 0 }), 'dashboard-export-test')()
    await exportStore.load(rangeForPreset('last-7-days', NOW))
    await exportStore.selectMetric('IND-1')
    await expect(exportStore.readMetricExport()).rejects.toThrow('超过 5 万条')
  })
})
