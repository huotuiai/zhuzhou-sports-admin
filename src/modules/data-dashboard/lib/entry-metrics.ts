import type { DashboardMetric, DashboardMetricCardItem, DashboardPendingMetric } from '../types'

// These IDs are only render keys. API requests always use the backend's metric code.
const pendingEntryMetrics: readonly DashboardPendingMetric[] = [
  {
    id: 'pending:entry-guide',
    group: 'entry',
    name: '入场引导使用次数',
    definition: '统计点击“我要入场”按钮的次数（PV）和去重人数（UV）。',
  },
  {
    id: 'pending:exit-guide',
    group: 'entry',
    name: '离场引导使用次数',
    definition: '统计点击“我要离场”按钮的次数（PV）和去重人数（UV）。',
  },
  {
    id: 'pending:map-navigation',
    group: 'entry',
    name: '地图导航使用次数',
    definition: '统计所有实际拉起地图导航的次数（PV）和去重人数（UV），不按按钮点击统计。',
  },
  {
    id: 'pending:vr-navigation',
    group: 'entry',
    name: 'VR 导航使用次数',
    definition: '统计所有实际拉起 VR 导航链接的次数（PV）和去重人数（UV），不按按钮点击统计。',
  },
]

function normalizedName(name: string): string {
  return name.replace(/[\s\-－—–]/g, '')
}

export function buildEntryMetricCards(metrics: readonly DashboardMetric[]): DashboardMetricCardItem[] {
  // Until metric codes are confirmed, match only the requested display names.
  const names = new Set(pendingEntryMetrics.map(metric => normalizedName(metric.name)))
  const cards = pendingEntryMetrics.map(pending =>
    metrics.find(metric => normalizedName(metric.name) === normalizedName(pending.name)) ?? pending)
  const existing: DashboardMetricCardItem[] = metrics.filter(metric => !names.has(normalizedName(metric.name)))
  const favoriteIndex = existing.findIndex(metric => normalizedName(metric.name) === '收藏接驳车次数')
  existing.splice(favoriteIndex < 0 ? existing.length : favoriteIndex + 1, 0, ...cards)
  return existing
}
