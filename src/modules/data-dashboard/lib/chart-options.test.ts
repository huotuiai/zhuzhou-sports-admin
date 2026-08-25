import { describe, expect, it } from 'vitest'
import type { DashboardDistribution, DashboardMetric, ParkingUsageItem } from '../types'
import { buildDistributionOption, buildMetricTrendOption, buildParkingUsageOption } from './chart-options'

const metric: DashboardMetric = {
  id: 'IND-T', group: 'entry', name: '测试指标', definition: '测试', source: '测试源',
  primaryLabel: 'PV', primaryValue: 30, secondaryLabel: 'UV', secondaryValue: 20,
  comparisonRate: 10, availability: 'ready', updatedAt: '2026-08-17T00:00:00.000Z',
  trend: [
    { date: '2026-08-16', primary: 10, secondary: 8 },
    { date: '2026-08-17', primary: 20, secondary: 12 },
  ],
}

const distribution: DashboardDistribution = {
  id: 'test', title: '测试分布', description: '测试', kind: 'donut', centerText: '3 项',
  slices: [{ key: 'a', label: '分类 A', value: 1 }, { key: 'b', label: '分类 B', value: 2 }],
}

const parking: ParkingUsageItem[] = [
  { id: 'P1', name: 'P1', total: 100, used: 25, available: 75, usageRate: 25 },
  { id: 'P2', name: 'P2', total: 100, used: 100, available: 0, usageRate: 100 },
]

describe('dashboard chart options', () => {
  it('maps line data, theme, aria, and reduced motion', () => {
    const option = buildMetricTrendOption(metric, 'secondary', 'dark', true) as Record<string, unknown>
    expect(option.animation).toBe(false)
    expect(option.aria).toEqual(expect.objectContaining({ enabled: true }))
    const series = option.series as Array<{ data: number[] }>
    expect(series[0]?.data).toEqual([8, 12])
  })

  it('maps donut slices with stable ids for click details', () => {
    const option = buildDistributionOption(distribution, 'light', false) as Record<string, unknown>
    const series = option.series as Array<{ data: Array<{ id: string, value: number }> }>
    expect(option.animation).toBe(true)
    expect(series[0]?.data).toEqual([
      expect.objectContaining({ id: 'a', value: 1 }),
      expect.objectContaining({ id: 'b', value: 2 }),
    ])
  })

  it('colors parking bars by usage state and includes accessible descriptions', () => {
    const option = buildParkingUsageOption(parking, 'light', true) as Record<string, unknown>
    const series = option.series as Array<{ data: Array<{ id: string, itemStyle: { color: string } }> }>
    expect(series[0]?.data.map((item) => item.id)).toEqual(['P1', 'P2'])
    expect(series[0]?.data[0]?.itemStyle.color).not.toBe(series[0]?.data[1]?.itemStyle.color)
    expect(option.aria).toEqual(expect.objectContaining({ enabled: true }))
  })
})
