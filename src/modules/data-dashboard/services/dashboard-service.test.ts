import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_METRIC_COUNTS,
  DashboardServiceError,
  MockDashboardService,
  normalizeDashboardRange,
  rangeForPreset,
} from './dashboard-service'

const NOW = new Date('2026-08-17T04:00:00.000Z')

describe('dashboard service', () => {
  it('resolves presets and validates custom date boundaries', () => {
    expect(rangeForPreset('today', NOW)).toEqual({ start: '2026-08-17', end: '2026-08-17' })
    expect(rangeForPreset('yesterday', NOW)).toEqual({ start: '2026-08-16', end: '2026-08-16' })
    expect(rangeForPreset('last-7-days', NOW)).toEqual({ start: '2026-08-11', end: '2026-08-17' })
    expect(rangeForPreset('last-30-days', NOW)).toEqual({ start: '2026-07-19', end: '2026-08-17' })
    expect(normalizeDashboardRange({ start: '2026-08-01', end: '2026-08-30' }, NOW))
      .toEqual({ start: '2026-08-01', end: '2026-08-17' })
    expect(() => normalizeDashboardRange({ start: '2026-08-18', end: '2026-08-20' }, NOW))
      .toThrow('结束日期不能早于开始日期')
    expect(() => normalizeDashboardRange({ start: '2025-08-01', end: '2026-08-17' }, NOW))
      .toThrow('一年以内')
  })

  it('loads the final P3 snapshot with fourteen entry and six page metrics', async () => {
    const service = new MockDashboardService({ now: () => NOW, syncDelayMs: 0 })
    const snapshot = await service.loadDashboard(rangeForPreset('last-7-days', NOW))

    expect(snapshot.operations.metrics).toHaveLength(20)
    expect(DASHBOARD_METRIC_COUNTS).toEqual({ entry: 14, page: 6 })
    expect(snapshot.operations.metrics.filter((metric) => metric.group === 'entry')).toHaveLength(14)
    expect(snapshot.operations.metrics.find((metric) => metric.id === 'IND-1')).toMatchObject({
      primaryValue: 128560,
      comparisonRate: 12.4,
    })
    expect(snapshot.operations.metrics.find((metric) => metric.id === 'IND-7')).toMatchObject({
      name: '检票口坐标点击次数',
      primaryValue: 6480,
      secondaryValue: 4920,
    })
    expect(snapshot.operations.metrics.find((metric) => metric.id === 'IND-42')?.name).toBe('资讯页面')
    expect(snapshot.distributions).toHaveLength(3)
    expect(snapshot.parkingUsage).toHaveLength(6)
    expect(snapshot.vrWorks).toHaveLength(3)
  })

  it('generates deterministic trends and paginates details at twenty rows', async () => {
    const service = new MockDashboardService({ now: () => NOW, syncDelayMs: 0 })
    const range = rangeForPreset('last-30-days', NOW)
    const first = await service.loadOperations(range)
    const second = await service.loadOperations(range)
    expect(first.metrics[0]?.trend).toEqual(second.metrics[0]?.trend)

    const pageOne = await service.getMetricDetails('IND-3', 'secondary', range, 1, 20)
    const pageTwo = await service.getMetricDetails('IND-3', 'secondary', range, 2, 20)
    expect(pageOne).toMatchObject({ total: 30, page: 1, pageSize: 20 })
    expect(pageOne.items).toHaveLength(20)
    expect(pageTwo.items).toHaveLength(10)
    await expect(service.getAllMetricDetails('IND-1', 'secondary', range)).rejects.toBeInstanceOf(DashboardServiceError)
  })

  it('returns distribution details and supports session-only VR sync success and failure', async () => {
    const successService = new MockDashboardService({ now: () => NOW, syncDelayMs: 0 })
    const before = (await successService.loadDashboard(rangeForPreset('last-7-days', NOW))).vrWorks[0]!
    const synced = await successService.syncVrWork(before.id)
    expect(synced.pv).toBeGreaterThan(before.pv)
    expect(synced.lastSyncedAt).toBe(NOW.toISOString())
    expect(await successService.getDistributionDetails('parking-usage', 'P5')).toEqual([
      expect.objectContaining({ objectName: 'P5 停车场', value: expect.stringContaining('使用率 100%') }),
    ])

    const failingService = new MockDashboardService({ now: () => NOW, failSyncForIds: new Set(['vr-2']), syncDelayMs: 0 })
    await expect(failingService.syncVrWork('vr-2')).rejects.toThrow('同步失败')
  })
})
