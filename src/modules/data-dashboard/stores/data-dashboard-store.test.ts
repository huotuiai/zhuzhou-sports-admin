import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type {
  DashboardExportFile,
  DashboardDistributionDetailKind,
  DashboardMetric,
  DashboardOperationsResult,
  DashboardService,
  DashboardSnapshot,
  DashboardStatsQuery,
  DashboardTrendPoint,
  DashboardVrSyncResult,
  DistributionDetailPage,
  MetricDetailPage,
  VrWorkMetric,
} from '../types'
import { createDataDashboardStore, DASHBOARD_DETAIL_PAGE_SIZE } from './data-dashboard-store'

const QUERY: DashboardStatsQuery = {
  preset: 'last-7-days',
  start: '2026-08-11',
  end: '2026-08-17',
  activityId: '',
}

const METRICS: DashboardMetric[] = [
  {
    id: 'IND-1',
    group: 'entry',
    name: '访问量',
    definition: '访问次数',
    source: '统计埋点',
    primaryLabel: 'PV',
    primaryValue: 120,
    secondaryLabel: 'UV',
    secondaryValue: 80,
    previousValue: 100,
    comparisonRate: 0.2,
    comparisonText: '较上期 +20%',
    updatedAt: '2026-08-17 12:00:00',
    trend: [],
  },
  {
    id: 'IND-2',
    group: 'page',
    name: '检票口导航',
    definition: '检票口导航次数',
    source: '统计埋点',
    primaryLabel: '次数',
    primaryValue: 30,
    secondaryLabel: null,
    secondaryValue: null,
    previousValue: 20,
    comparisonRate: 0.5,
    comparisonText: '较上期 +50%',
    updatedAt: '2026-08-17 12:00:00',
    trend: [],
  },
]

function vrWork(pv = 99): VrWorkMetric {
  return {
    id: '90071992547409931',
    rank: 1,
    externalId: '720-1',
    title: '体育场全景',
    coverUrl: 'https://example.com/cover.jpg',
    bindingObject: '体育场',
    pv,
    uv: 60,
    likes: 10,
    shares: 2,
    comments: 1,
    phoneClicks: 3,
    sceneCount: 8,
    lastSyncedAt: '2026-08-17 12:00:00',
    isInvalid: false,
    enabled: true,
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-17 12:00:00',
  }
}

function snapshot(query: DashboardStatsQuery = QUERY): DashboardSnapshot {
  return {
    activities: [{ id: '9223372036854775807', name: '八月赛事', start: '2026-08-15', end: '2026-08-18' }],
    operations: {
      query: { ...query },
      range: { start: query.start, end: query.end },
      metrics: METRICS.map(metric => ({ ...metric, trend: [] })),
      updatedAt: '2026-08-17 12:00:00',
    },
    distributions: [{
      id: 'parking-charge',
      title: '停车收费类型分布',
      description: '停车场收费类型汇总',
      kind: 'donut',
      detailKind: 'parking_fee',
      centerText: '1 项',
      slices: [{ key: 'free', label: '免费', value: 1 }],
    }],
    parkingUsage: [{ id: 'P1', name: '东停车场', total: 100, used: 60, available: 40, usageRate: 0.6 }],
    vrWorks: [vrWork()],
    currentDataUpdatedAt: '2026-08-17 12:00:00',
  }
}

class StubDashboardService implements DashboardService {
  operationQueries: DashboardStatsQuery[] = []
  trendCalls: Array<{ metricId: string, query: DashboardStatsQuery }> = []
  detailCalls: Array<{ metricId: string, query: DashboardStatsQuery, page: number, pageSize: number }> = []
  distributionDetailCalls: Array<{ kind: DashboardDistributionDetailKind, slice: string, page: number, pageSize: number }> = []
  exportCalls: Array<{ metricId: string, query: DashboardStatsQuery }> = []
  syncCalls = 0
  nextVrWorks = [vrWork(120)]
  syncResult: DashboardVrSyncResult = { sourceId: '720yun', result: 'success', summary: '同步 1 条', disabled: false }
  exportError: Error | null = null
  syncError: Error | null = null
  distributionDetailError: Error | null = null

  async loadDashboard(query: DashboardStatsQuery): Promise<DashboardSnapshot> {
    return snapshot(query)
  }

  async loadOperations(query: DashboardStatsQuery): Promise<DashboardOperationsResult> {
    this.operationQueries.push({ ...query })
    return {
      activities: snapshot(query).activities,
      operations: snapshot(query).operations,
    }
  }

  async loadMetricTrend(metricId: string, query: DashboardStatsQuery): Promise<DashboardTrendPoint[]> {
    this.trendCalls.push({ metricId, query: { ...query } })
    return [{ date: query.start, primary: 12, secondary: metricId === 'IND-1' ? 8 : null }]
  }

  async getMetricDetails(metricId: string, query: DashboardStatsQuery, page: number, pageSize: number): Promise<MetricDetailPage> {
    this.detailCalls.push({ metricId, query: { ...query }, page, pageSize })
    return {
      items: [{
        id: `event-${page}`,
        occurredAt: '2026-08-17 12:00:00',
        eventName: 'page_view',
        deviceId: 'device-1',
        page: '/map',
        referenceType: 'gate',
        referenceId: '12',
        extraJson: null,
        ip: '127.0.0.1',
        createdAt: '2026-08-17 12:00:01',
        updatedAt: '2026-08-17 12:00:01',
      }],
      total: 41,
      page,
      pageSize,
    }
  }

  async exportMetricDetails(metricId: string, query: DashboardStatsQuery): Promise<DashboardExportFile> {
    this.exportCalls.push({ metricId, query: { ...query } })
    if (this.exportError) throw this.exportError
    return { content: new Blob(['event_name\npage_view']), filename: 'stats.csv' }
  }

  async loadDistributions(): Promise<Pick<DashboardSnapshot, 'distributions' | 'parkingUsage'>> {
    const current = snapshot()
    return { distributions: current.distributions, parkingUsage: current.parkingUsage }
  }

  async getDistributionDetails(
    kind: DashboardDistributionDetailKind,
    slice: string,
    page: number,
    pageSize: number,
  ): Promise<DistributionDetailPage> {
    this.distributionDetailCalls.push({ kind, slice, page, pageSize })
    if (this.distributionDetailError) throw this.distributionDetailError
    return {
      items: [{ id: `${slice}-${page}`, code: `CODE-${page}`, name: `明细 ${page}`, extra: '附加说明' }],
      total: 41,
      page,
      pageSize,
    }
  }

  async loadVrWorks(): Promise<VrWorkMetric[]> {
    return this.nextVrWorks
  }

  async syncVrWorks(): Promise<DashboardVrSyncResult> {
    this.syncCalls += 1
    if (this.syncError) throw this.syncError
    return this.syncResult
  }
}

describe('data dashboard store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('loads the three dashboard sections and derives metric group counts', async () => {
    const store = createDataDashboardStore(new StubDashboardService(), 'dashboard-load-test')()

    expect(await store.load(QUERY)).toBe(true)
    expect(store.metricGroupCounts).toEqual({ entry: 1, page: 1 })
    expect(store.visibleMetrics.map(metric => metric.id)).toEqual(['IND-1'])
    expect(store.snapshot?.vrWorks[0]?.externalId).toBe('720-1')
  })

  it('lazily loads trend and raw events while PV/UV switching stays local', async () => {
    const service = new StubDashboardService()
    const store = createDataDashboardStore(service, 'dashboard-detail-test')()
    await store.load(QUERY)

    await store.selectMetric('IND-1')
    expect(service.trendCalls).toHaveLength(1)
    expect(service.detailCalls[0]).toMatchObject({ metricId: 'IND-1', page: 1, pageSize: DASHBOARD_DETAIL_PAGE_SIZE })
    expect(store.selectedMetric?.trend).toEqual([{ date: QUERY.start, primary: 12, secondary: 8 }])
    expect(store.metricDetail.items[0]?.eventName).toBe('page_view')

    store.setDetailDimension('secondary')
    expect(store.detailDimension).toBe('secondary')
    expect(service.trendCalls).toHaveLength(1)
    expect(service.detailCalls).toHaveLength(1)

    await store.setDetailPage(2)
    expect(service.detailCalls.at(-1)).toMatchObject({ page: 2, pageSize: 20 })
    expect(store.metricDetail.page).toBe(2)

    await store.setDetailPageSize(50)
    expect(service.detailCalls.at(-1)).toMatchObject({ page: 1, pageSize: 50 })
    expect(store.metricDetail.pageSize).toBe(50)
  })

  it('refreshes only operations and reloads an open metric with the new query', async () => {
    const service = new StubDashboardService()
    const store = createDataDashboardStore(service, 'dashboard-refresh-test')()
    await store.load(QUERY)
    const distributions = store.snapshot?.distributions
    const vrWorks = store.snapshot?.vrWorks
    await store.selectMetric('IND-1')
    const activityQuery: DashboardStatsQuery = { ...QUERY, activityId: '9223372036854775807' }

    expect(await store.refreshOperations(activityQuery)).toBe(true)
    expect(store.snapshot?.distributions).toBe(distributions)
    expect(store.snapshot?.vrWorks).toBe(vrWorks)
    expect(service.operationQueries).toEqual([activityQuery])
    expect(service.trendCalls.at(-1)?.query.activityId).toBe(activityQuery.activityId)
    expect(service.detailCalls.at(-1)?.query.activityId).toBe(activityQuery.activityId)
  })

  it('keeps the newest operations response when requests finish out of order', async () => {
    const service = new StubDashboardService()
    const store = createDataDashboardStore(service, 'dashboard-race-test')()
    await store.load(QUERY)
    const pending = new Map<string, (value: DashboardOperationsResult) => void>()
    service.loadOperations = query => new Promise((resolve) => {
      pending.set(query.activityId || query.preset, resolve)
    })
    const olderQuery: DashboardStatsQuery = { ...QUERY, preset: 'last-30-days', start: '2026-07-19' }
    const latestQuery: DashboardStatsQuery = { ...QUERY, activityId: '9223372036854775807' }

    const olderRequest = store.refreshOperations(olderQuery)
    const latestRequest = store.refreshOperations(latestQuery)
    pending.get(latestQuery.activityId)?.({
      activities: snapshot(latestQuery).activities,
      operations: snapshot(latestQuery).operations,
    })
    await expect(latestRequest).resolves.toBe(true)
    pending.get(olderQuery.preset)?.({
      activities: snapshot(olderQuery).activities,
      operations: snapshot(olderQuery).operations,
    })
    await expect(olderRequest).resolves.toBe(false)

    expect(store.snapshot?.operations.query).toEqual(latestQuery)
    expect(store.isOperationsLoading).toBe(false)
  })

  it('closes metric details when switching groups', async () => {
    const store = createDataDashboardStore(new StubDashboardService(), 'dashboard-group-test')()
    await store.load(QUERY)
    await store.selectMetric('IND-1')

    store.setActiveGroup('page')
    expect(store.selectedMetric).toBeNull()
    expect(store.visibleMetrics.map(metric => metric.id)).toEqual(['IND-2'])
    expect(store.metricDetail.items).toEqual([])
  })

  it('returns the backend CSV and exposes export errors without a frontend row limit', async () => {
    const service = new StubDashboardService()
    const store = createDataDashboardStore(service, 'dashboard-export-test')()
    await store.load(QUERY)
    await store.selectMetric('IND-1')

    await expect(store.exportMetricDetails()).resolves.toMatchObject({ filename: 'stats.csv' })
    expect(service.exportCalls[0]).toEqual({ metricId: 'IND-1', query: QUERY })

    service.exportError = new Error('导出超过 5000 条，请缩小时间范围')
    await expect(store.exportMetricDetails()).resolves.toBeNull()
    expect(store.detailError).toBe('导出超过 5000 条，请缩小时间范围')
  })

  it('loads distribution drilldowns with stable kind and slice pagination', async () => {
    const service = new StubDashboardService()
    const store = createDataDashboardStore(service, 'dashboard-distribution-detail-test')()
    await store.load(QUERY)

    await store.selectDistribution({ kind: 'parking_fee', slice: 'free', title: '停车收费类型分布', label: '免费' })
    expect(service.distributionDetailCalls[0]).toEqual({ kind: 'parking_fee', slice: 'free', page: 1, pageSize: 20 })
    expect(store.distributionDetail.items[0]?.code).toBe('CODE-1')

    await store.setDistributionDetailPage(2)
    expect(service.distributionDetailCalls.at(-1)).toEqual({ kind: 'parking_fee', slice: 'free', page: 2, pageSize: 20 })
    expect(store.distributionDetail.page).toBe(2)

    await store.setDistributionDetailPageSize(50)
    expect(service.distributionDetailCalls.at(-1)).toEqual({ kind: 'parking_fee', slice: 'free', page: 1, pageSize: 50 })
    expect(store.distributionDetail.pageSize).toBe(50)

    store.closeDistributionDetail()
    expect(store.selectedDistribution).toBeNull()
    expect(store.distributionDetail.items).toEqual([])
  })

  it('keeps the newest distribution drilldown and supports retry after failure', async () => {
    const service = new StubDashboardService()
    const store = createDataDashboardStore(service, 'dashboard-distribution-race-test')()
    await store.load(QUERY)
    const pending = new Map<string, (value: DistributionDetailPage) => void>()
    service.getDistributionDetails = (kind, slice, page, pageSize) => new Promise((resolve) => {
      service.distributionDetailCalls.push({ kind, slice, page, pageSize })
      pending.set(`${kind}:${slice}`, resolve)
    })

    const older = store.selectDistribution({ kind: 'parking_fee', slice: 'free', title: '停车收费', label: '免费' })
    const latest = store.selectDistribution({ kind: 'control', slice: 'draft', title: '管制状态', label: '草稿' })
    pending.get('control:draft')?.({ items: [{ id: '2', code: 'C2', name: '草稿管制', extra: '' }], total: 1, page: 1, pageSize: 20 })
    await latest
    pending.get('parking_fee:free')?.({ items: [{ id: '1', code: 'P1', name: '免费停车场', extra: '' }], total: 1, page: 1, pageSize: 20 })
    await older
    expect(store.selectedDistribution?.kind).toBe('control')
    expect(store.distributionDetail.items[0]?.code).toBe('C2')

    service.getDistributionDetails = async () => { throw new Error('下钻加载失败') }
    await store.loadDistributionDetail()
    expect(store.distributionDetailError).toBe('下钻加载失败')

    service.getDistributionDetails = async (_kind, _slice, page, pageSize) => ({
      items: [{ id: '3', code: 'C3', name: '重试成功', extra: '' }], total: 1, page, pageSize,
    })
    expect(await store.loadDistributionDetail()).toBe(true)
    expect(store.distributionDetailError).toBeNull()
    expect(store.distributionDetail.items[0]?.code).toBe('C3')
  })

  it('syncs all VR works, refreshes the ranking and preserves backend failure summaries', async () => {
    const service = new StubDashboardService()
    const store = createDataDashboardStore(service, 'dashboard-sync-test')()
    await store.load(QUERY)

    const success = await store.syncVrWorks()
    expect(success?.result).toBe('success')
    expect(service.syncCalls).toBe(1)
    expect(store.snapshot?.vrWorks[0]?.pv).toBe(120)

    service.syncResult = { sourceId: '720yun', result: 'fail', summary: '鉴权失败，对接源已停用', disabled: true }
    const failure = await store.syncVrWorks()
    expect(failure?.disabled).toBe(true)
    expect(store.vrSyncError).toBe('鉴权失败，对接源已停用')

    service.syncError = new Error('无同步权限')
    await expect(store.syncVrWorks()).resolves.toBeNull()
    expect(store.vrSyncError).toBe('无同步权限')
  })
})
