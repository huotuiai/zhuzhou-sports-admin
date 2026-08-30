import type { EChartsCoreOption } from 'echarts/core'
import type { ThemeMode } from '@/stores/theme'
import type {
  DashboardDistribution,
  DashboardDistributionSlice,
  DashboardMetric,
  DashboardMetricDimension,
  ParkingUsageItem,
} from '../types'

interface DashboardChartTheme {
  foreground: string
  muted: string
  border: string
  card: string
  primary: string
  cyan: string
  success: string
  warning: string
  danger: string
  mutedFill: string
}

export function distributionSliceColor(
  slice: DashboardDistributionSlice,
  mode: ThemeMode,
): string {
  const theme = dashboardChartTheme(mode)
  const colors = {
    primary: theme.primary,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
    muted: theme.mutedFill,
  }
  return colors[slice.tone ?? 'primary']
}

export function dashboardChartTheme(mode: ThemeMode): DashboardChartTheme {
  if (mode === 'dark') {
    return {
      foreground: '#f8fafc', muted: '#a8b4c7', border: '#26344a', card: '#0b1324',
      primary: '#38bdf8', cyan: '#22d3ee', success: '#4ade80', warning: '#fbbf24',
      danger: '#fb7185', mutedFill: '#334155',
    }
  }
  return {
    foreground: '#0f172a', muted: '#475569', border: '#cbd5e1', card: '#ffffff',
    primary: '#0284c7', cyan: '#0891b2', success: '#15803d', warning: '#b45309',
    danger: '#dc2626', mutedFill: '#cbd5e1',
  }
}

function shortDate(value: string): string {
  return value.slice(5)
}

export function buildMetricTrendOption(
  metric: DashboardMetric,
  dimension: DashboardMetricDimension,
  mode: ThemeMode,
  reducedMotion: boolean,
): EChartsCoreOption {
  const theme = dashboardChartTheme(mode)
  const isSecondary = dimension === 'secondary'
  const values = metric.trend.map((point) => isSecondary ? (point.secondary ?? 0) : point.primary)
  const label = isSecondary ? (metric.secondaryLabel ?? '次级数据') : metric.primaryLabel
  return {
    animation: !reducedMotion,
    color: [isSecondary ? theme.cyan : theme.primary],
    aria: {
      enabled: true,
      label: { description: `${metric.name}${label}在当前统计时间范围内的逐日趋势图。` },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.card,
      borderColor: theme.border,
      textStyle: { color: theme.foreground },
      valueFormatter: (value: unknown) => Number(value).toLocaleString('zh-CN'),
    },
    grid: { left: 54, right: 18, top: 24, bottom: 38 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: metric.trend.map((point) => shortDate(point.date)),
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { show: false },
      axisLabel: { color: theme.muted, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: theme.muted },
      splitLine: { lineStyle: { color: theme.border, opacity: 0.55 } },
    },
    series: [{
      name: label,
      type: 'line',
      data: values,
      smooth: values.length > 2 ? 0.28 : false,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 3 },
      areaStyle: { opacity: mode === 'dark' ? 0.12 : 0.09 },
      emphasis: { focus: 'series' },
    }],
  }
}

export function buildDistributionOption(
  distribution: DashboardDistribution,
  mode: ThemeMode,
  reducedMotion: boolean,
): EChartsCoreOption {
  const theme = dashboardChartTheme(mode)
  return {
    animation: !reducedMotion,
    color: distribution.slices.map((slice) => distributionSliceColor(slice, mode)),
    aria: {
      enabled: true,
      label: { description: `${distribution.title}，${distribution.slices.map((slice) => `${slice.label}${slice.value}`).join('，')}。` },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.card,
      borderColor: theme.border,
      textStyle: { color: theme.foreground },
      formatter: '{b}<br/>{c}（{d}%）',
    },
    series: [{
      name: distribution.title,
      type: 'pie',
      radius: distribution.kind === 'progress' ? ['64%', '82%'] : ['53%', '76%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderColor: theme.card, borderWidth: 3, borderRadius: 4 },
      emphasis: { scaleSize: 5 },
      data: distribution.slices.map((slice) => ({
        id: slice.key,
        name: slice.label,
        value: slice.value,
        itemStyle: { color: distributionSliceColor(slice, mode) },
      })),
    }],
    graphic: distribution.centerText ? [{
      type: 'text',
      left: 'center',
      top: 'middle',
      silent: true,
      style: {
        text: distribution.centerText,
        fill: theme.foreground,
        font: '600 16px "PingFang SC", "Microsoft YaHei", sans-serif',
        textAlign: 'center',
        textVerticalAlign: 'middle',
      },
    }] : undefined,
  }
}

function parkingTone(item: ParkingUsageItem, theme: DashboardChartTheme): string {
  if (item.usageRate >= 100) return theme.danger
  if (item.usageRate >= 60) return theme.warning
  return theme.success
}

export function buildParkingUsageOption(
  items: readonly ParkingUsageItem[],
  mode: ThemeMode,
  reducedMotion: boolean,
): EChartsCoreOption {
  const theme = dashboardChartTheme(mode)
  return {
    animation: !reducedMotion,
    aria: {
      enabled: true,
      label: { description: `停车场车位使用情况，${items.map((item) => `${item.name}使用率${item.usageRate}%`).join('，')}。` },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.card,
      borderColor: theme.border,
      textStyle: { color: theme.foreground },
    },
    grid: { left: 58, right: 24, top: 50, bottom: 44 },
    xAxis: {
      type: 'category',
      data: items.map((item) => item.name),
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { show: false },
      axisLabel: { color: theme.foreground, fontWeight: 600 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: '已用车位',
      nameTextStyle: { color: theme.muted },
      axisLabel: { color: theme.muted },
      splitLine: { lineStyle: { color: theme.border, opacity: 0.55 } },
    },
    series: [{
      name: '已用车位',
      type: 'bar',
      barMaxWidth: 74,
      data: items.map((item) => ({
        id: item.id,
        name: item.name,
        value: item.used,
        itemStyle: { color: parkingTone(item, theme), borderRadius: [7, 7, 0, 0] },
        label: {
          show: true,
          position: 'top',
          color: parkingTone(item, theme),
          fontWeight: 600,
          formatter: `使用率 ${item.usageRate}%`,
        },
        tooltip: { formatter: `${item.name} 停车场<br/>已用 ${item.used} / ${item.total}<br/>剩余 ${item.available ?? '未知'}<br/>使用率 ${item.usageRate}%` },
      })),
    }],
  }
}
