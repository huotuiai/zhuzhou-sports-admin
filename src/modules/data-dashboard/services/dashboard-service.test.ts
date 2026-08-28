import type { AxiosResponse } from 'axios'
import type { SignedRequestConfig } from '@/lib/http'
import type { DashboardStatsQuery } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createDashboardService,
  dashboardExportFilename,
  dashboardQueryParams,
  mapApiAnalyticsEvent,
  mapApiDistribution,
  mapApiOverview,
  mapApiTimeWindow,
  mapApiVrWorks,
  normalizeDashboardRange,
  queryForPreset,
  rangeForPreset,
  type ApiAnalyticsEvent,
  type ApiDistributionVO,
  type ApiOverviewVO,
  type ApiVrWork,
} from './dashboard-service'

const NOW = new Date('2026-08-27T12:00:00+08:00')

function query(overrides: Partial<DashboardStatsQuery> = {}): DashboardStatsQuery {
  return { preset: 'last-7-days', activityId: '', start: '2026-08-21', end: '2026-08-27', ...overrides }
}

function overview(overrides: Partial<ApiOverviewVO> = {}): ApiOverviewVO {
  return {
    window: { preset: '7d', start: '2026-08-21T00:00:00+08:00', end: '2026-08-28T00:00:00+08:00' },
    activities: [{
      id: '9007199254740995', title: '八月足球赛',
      activity_start_at: '2026-08-25T18:00:00+08:00', activity_end_at: '2026-08-25T21:00:00+08:00',
    }],
    entry: [{
      code: 'IND-3', name: '座位检索次数', hint: '座位检索 PV/UV', group: 'entry',
      value: '120', uv: '90', prev: 100, change: 0.2, change_text: '上升 20%',
    }],
    page: [{
      code: 'IND-2', name: 'H5 访问人数 UV', hint: '按设备去重', group: 'page',
      value: 80, uv: null, prev: 0, change: null, change_text: '新增',
    }],
    as_of: '2026-08-27T12:00:00+08:00',
    ...overrides,
  }
}

function distribution(): ApiDistributionVO {
  return {
    parking_fee: [{ name: '免费', value: 2 }, { name: '收费', value: '3' }],
    parking_remain: [{ name: 'P1', remain: '20', capacity: 100, usage: '0.8' }],
    controls: [{ name: '已发布', value: 4 }, { name: '草稿', value: 1 }],
    activities: [{ name: '上架', value: 3 }, { name: '下架', value: 2 }],
  }
}

function vrWork(overrides: Partial<ApiVrWork> = {}): ApiVrWork {
  return {
    id: '9007199254740997', create_at: '2026-08-20T08:00:00+08:00', update_at: '2026-08-27T10:00:00+08:00',
    external_id: 'yun-720-1', title: '体育中心全景', cover_url: 'https://cdn.example.com/vr.jpg', bind_object: '体育场',
    pv_count: '1000', like_count: 60, scene_count: '12', uv_count: '600', share_count: null,
    comment_count: 10, phone_click_count: null, last_sync_at: '2026-08-27T10:00:00+08:00', is_invalid: 0, status: 1,
    ...overrides,
  }
}

function event(overrides: Partial<ApiAnalyticsEvent> = {}): ApiAnalyticsEvent {
  return {
    id: '9007199254740999', create_at: '2026-08-27T10:00:01+08:00', update_at: '2026-08-27T10:00:01+08:00',
    occurred_at: '2026-08-27T10:00:00+08:00', event_name: 'seat_search', device_id: 'device-1', page: '/seat',
    ref_type: 'zone', ref_id: '9007199254741001', extra_json: '{"source":"home"}', ip: '127.0.0.1', ...overrides,
  }
}

describe('dashboard API service', () => {
  it('resolves presets and validates custom date boundaries', () => {
    expect(rangeForPreset('today', NOW)).toEqual({ start: '2026-08-27', end: '2026-08-27' })
    expect(rangeForPreset('yesterday', NOW)).toEqual({ start: '2026-08-26', end: '2026-08-26' })
    expect(rangeForPreset('last-7-days', NOW)).toEqual({ start: '2026-08-21', end: '2026-08-27' })
    expect(rangeForPreset('last-30-days', NOW)).toEqual({ start: '2026-07-29', end: '2026-08-27' })
    expect(normalizeDashboardRange({ start: '2026-08-01', end: '2026-08-30' }, NOW)).toEqual({ start: '2026-08-01', end: '2026-08-27' })
    expect(() => normalizeDashboardRange({ start: '2025-08-01', end: '2026-08-27' }, NOW)).toThrow('一年以内')
  })

  it('maps every query preset and gives activity_id precedence', () => {
    expect(dashboardQueryParams(queryForPreset('today', NOW))).toEqual({ range: 'today' })
    expect(dashboardQueryParams(queryForPreset('yesterday', NOW))).toEqual({ range: 'yesterday' })
    expect(dashboardQueryParams(queryForPreset('last-7-days', NOW))).toEqual({ range: '7d' })
    expect(dashboardQueryParams(queryForPreset('last-30-days', NOW))).toEqual({ range: '30d' })
    expect(dashboardQueryParams(query({ preset: 'custom', start: '2026-08-01', end: '2026-08-20' })))
      .toEqual({ range: 'custom', start: '2026-08-01', end: '2026-08-20' })
    expect(dashboardQueryParams(query({ preset: 'custom', activityId: '9007199254740995' })))
      .toEqual({ activity_id: '9007199254740995' })
  })

  it('maps the backend open-ended time window, KPI cards and nullable activity dates', () => {
    expect(mapApiTimeWindow({ preset: 'custom', start: '2026-08-25T18:00:00+08:00', end: '2026-08-25T21:00:00+08:00' }))
      .toEqual({ start: '2026-08-25', end: '2026-08-25' })
    const result = mapApiOverview(overview({
      activities: [{ id: 1, title: '时间待定活动', activity_start_at: null, activity_end_at: null }],
    }), query())
    expect(result.operations.range).toEqual({ start: '2026-08-21', end: '2026-08-27' })
    expect(result.operations.metrics[0]).toMatchObject({
      id: 'IND-3', group: 'entry', primaryLabel: 'PV', primaryValue: 120, secondaryLabel: 'UV',
      secondaryValue: 90, previousValue: 100, comparisonRate: 0.2, comparisonText: '上升 20%', source: '统计埋点', trend: [],
    })
    expect(result.operations.metrics[1]).toMatchObject({ id: 'IND-2', primaryLabel: 'UV', comparisonText: '新增' })
    expect(result.activities[0]).toEqual({ id: '1', name: '时间待定活动', start: null, end: null })
  })

  it('maps raw analytics events, int64 IDs, distributions and parking usage', () => {
    expect(mapApiAnalyticsEvent(event())).toMatchObject({
      id: '9007199254740999', eventName: 'seat_search', referenceId: '9007199254741001', extraJson: '{"source":"home"}', ip: '127.0.0.1',
    })
    const result = mapApiDistribution(distribution())
    expect(result.distributions.map(item => item.slices.length)).toEqual([2, 2, 2])
    expect(result.distributions[0]?.centerText).toBe('5 项')
    expect(result.parkingUsage[0]).toEqual({ id: 'parking-1', name: 'P1', total: 100, used: 80, available: 20, usageRate: 80 })
  })

  it('maps remote VR fields and ranks works by PV', () => {
    const result = mapApiVrWorks([vrWork({ id: 1, title: '较少浏览', pv_count: 10 }), vrWork({ id: 2, title: '更多浏览', pv_count: 20, is_invalid: 1 })])
    expect(result.map(item => item.id)).toEqual(['2', '1'])
    expect(result[0]).toMatchObject({ rank: 1, coverUrl: 'https://cdn.example.com/vr.jpg', bindingObject: '体育场', uv: 600, isInvalid: true })
  })

  it('loads overview, distribution and VR concurrently as the dashboard snapshot', async () => {
    const configs: SignedRequestConfig[] = []
    const requester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      if (config.url === 'api/v1/admin/stats/overview') return overview() as T
      if (config.url === 'api/v1/admin/stats/distribution') return distribution() as T
      return [vrWork()] as T
    }
    const snapshot = await createDashboardService(requester).loadDashboard(query())
    expect(snapshot.operations.metrics).toHaveLength(2)
    expect(snapshot.distributions).toHaveLength(3)
    expect(snapshot.vrWorks).toHaveLength(1)
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/stats/overview', params: { range: '7d' } },
      { method: 'GET', url: 'api/v1/admin/stats/distribution' },
      { method: 'GET', url: 'api/v1/admin/stats/vr-works' },
    ])
  })

  it('calls trend and raw event pagination with the same activity filter', async () => {
    const configs: SignedRequestConfig[] = []
    const requester = async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
      configs.push(config as SignedRequestConfig)
      if (config.url === 'api/v1/admin/stats/trend') return [{ day: '2026-08-25', value: 12, uv: 9 }] as T
      return { list: [event()], total: '1', page: 1, page_size: 20 } as T
    }
    const service = createDashboardService(requester)
    const activityQuery = query({ preset: 'custom', activityId: '9007199254740995' })
    await expect(service.loadMetricTrend('IND-3', activityQuery)).resolves.toEqual([{ date: '2026-08-25', primary: 12, secondary: 9 }])
    await expect(service.getMetricDetails('IND-3', activityQuery, 1, 20)).resolves.toMatchObject({ total: 1, page: 1, pageSize: 20 })
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/stats/trend', params: { code: 'IND-3', activity_id: '9007199254740995' } },
      { method: 'GET', url: 'api/v1/admin/stats/details', params: { page: 1, page_size: 20, code: 'IND-3', activity_id: '9007199254740995' } },
    ])
  })

  it('downloads the raw server CSV and triggers global VR sync', async () => {
    const configs: SignedRequestConfig[] = []
    const blob = new Blob(['csv'], { type: 'text/csv' })
    const service = createDashboardService(
      async <T, D = unknown>(config: SignedRequestConfig<D>): Promise<T> => {
        configs.push(config as SignedRequestConfig)
        return { source_id: '9007199254740995', result: 'success', summary: '同步完成', disabled: false } as T
      },
      async config => {
        configs.push(config)
        return { data: blob, headers: { 'content-disposition': "attachment; filename*=UTF-8''stats%20raw.csv" } } as unknown as AxiosResponse<Blob>
      },
    )
    await expect(service.exportMetricDetails('IND-3', query())).resolves.toEqual({ content: blob, filename: 'stats raw.csv' })
    await expect(service.syncVrWorks()).resolves.toEqual({ sourceId: '9007199254740995', result: 'success', summary: '同步完成', disabled: false })
    expect(configs).toEqual([
      { method: 'GET', url: 'api/v1/admin/stats/details/export', params: { code: 'IND-3', range: '7d' }, responseType: 'blob', headers: { Accept: 'text/csv' } },
      { method: 'POST', url: 'api/v1/admin/stats/vr-sync', data: {} },
    ])
    expect(dashboardExportFilename('attachment; filename="../../bad.csv"')).toBe('.._.._bad.csv')
  })
})
