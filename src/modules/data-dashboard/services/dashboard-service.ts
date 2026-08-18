import type {
  DashboardActivityOption,
  DashboardDatePreset,
  DashboardDateRange,
  DashboardDistribution,
  DashboardMetric,
  DashboardMetricDetail,
  DashboardMetricDimension,
  DashboardMetricGroup,
  DashboardOperationsSnapshot,
  DashboardService,
  DashboardSnapshot,
  DashboardTrendPoint,
  DistributionDetailRow,
  MetricDetailPage,
  ParkingUsageItem,
  VrWorkMetric,
} from '../types'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

interface MetricSeed {
  id: string
  group: DashboardMetricGroup
  name: string
  definition: string
  source: string
  primaryLabel: string
  primaryValue: number
  secondaryLabel: string | null
  secondaryValue: number | null
  comparisonRate: number | null
  sourceEntry: string
}

export interface MockDashboardServiceOptions {
  now?: () => Date
  failSyncForIds?: ReadonlySet<string>
  syncDelayMs?: number
}

export class DashboardServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DashboardServiceError'
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function toDashboardDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDashboardDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new DashboardServiceError('日期格式无效')
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime()) || toDashboardDate(date) !== value) {
    throw new DashboardServiceError('日期格式无效')
  }
  return date
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function inclusiveDayCount(range: DashboardDateRange): number {
  const start = parseDashboardDate(range.start)
  const end = parseDashboardDate(range.end)
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
}

export function normalizeDashboardRange(range: DashboardDateRange, now = new Date()): DashboardDateRange {
  const start = parseDashboardDate(range.start)
  const requestedEnd = parseDashboardDate(range.end)
  const today = parseDashboardDate(toDashboardDate(now))
  const end = requestedEnd > today ? today : requestedEnd
  if (start > end) throw new DashboardServiceError('结束日期不能早于开始日期')
  const span = Math.floor((end.getTime() - start.getTime()) / 86_400_000)
  if (span > 365) throw new DashboardServiceError('数据量过大，建议将时间范围缩小到一年以内')
  return { start: toDashboardDate(start), end: toDashboardDate(end) }
}

export function rangeForPreset(preset: Exclude<DashboardDatePreset, 'custom'>, now = new Date()): DashboardDateRange {
  const today = parseDashboardDate(toDashboardDate(now))
  if (preset === 'today') return { start: toDashboardDate(today), end: toDashboardDate(today) }
  if (preset === 'yesterday') {
    const yesterday = addDays(today, -1)
    return { start: toDashboardDate(yesterday), end: toDashboardDate(yesterday) }
  }
  const days = preset === 'last-30-days' ? 30 : 7
  return { start: toDashboardDate(addDays(today, -(days - 1))), end: toDashboardDate(today) }
}

const METRIC_SEEDS: readonly MetricSeed[] = [
  { id: 'IND-1', group: 'core', name: 'H5 页面访问量 PV', definition: 'H5 页面浏览次数之和，不含 Banner 曝光与点击数据。', source: 'L1 埋点', primaryLabel: 'PV', primaryValue: 128560, secondaryLabel: null, secondaryValue: null, comparisonRate: 12.4, sourceEntry: 'H5 页面' },
  { id: 'IND-2', group: 'core', name: 'H5 访问人数 UV', definition: '按设备去重后的 H5 访问人数。', source: 'L1 埋点', primaryLabel: 'UV', primaryValue: 42380, secondaryLabel: null, secondaryValue: null, comparisonRate: 9.8, sourceEntry: 'H5 页面' },
  { id: 'IND-3', group: 'core', name: '座位检索次数', definition: '通过检索框发起“入场方案”查询的次数。', source: 'L1 埋点', primaryLabel: '查询次数', primaryValue: 8942, secondaryLabel: null, secondaryValue: null, comparisonRate: 18.2, sourceEntry: '座位检索' },
  { id: 'IND-5', group: 'core', name: '停车查询次数', definition: '进入“停车”Tab 的次数。', source: 'L1 埋点', primaryLabel: '查询次数', primaryValue: 15732, secondaryLabel: null, secondaryValue: null, comparisonRate: 21.7, sourceEntry: '停车 Tab' },
  { id: 'IND-6', group: 'core', name: '接驳车查询次数', definition: '进入“接驳”Tab 的次数。', source: 'L1 埋点', primaryLabel: '查询次数', primaryValue: 12480, secondaryLabel: null, secondaryValue: null, comparisonRate: -3.2, sourceEntry: '接驳 Tab' },
  { id: 'IND-7', group: 'core', name: '管制查看次数', definition: '用户查看交通管制详情的次数。', source: 'L1 埋点', primaryLabel: '查看次数', primaryValue: 3856, secondaryLabel: null, secondaryValue: null, comparisonRate: 42.6, sourceEntry: '管制详情' },
  { id: 'IND-8', group: 'core', name: '场馆全景点击次数', definition: '点击首页九宫格“场馆全景”入口的次数。', source: 'L1 埋点', primaryLabel: '点击次数', primaryValue: 9214, secondaryLabel: null, secondaryValue: null, comparisonRate: 15.3, sourceEntry: '首页九宫格' },
  { id: 'IND-22', group: 'entry', name: '九宫格 · 场馆全景', definition: '点击首页九宫格“场馆全景”入口的 PV/UV。', source: 'L1 埋点', primaryLabel: '点击 PV', primaryValue: 6892, secondaryLabel: '点击 UV', secondaryValue: 5120, comparisonRate: 8.1, sourceEntry: '首页九宫格' },
  { id: 'IND-23', group: 'entry', name: '九宫格 · 联系我们', definition: '点击首页九宫格“联系我们”入口的 PV/UV。', source: 'L1 埋点', primaryLabel: '点击 PV', primaryValue: 1245, secondaryLabel: '点击 UV', secondaryValue: 980, comparisonRate: -2.4, sourceEntry: '首页九宫格' },
  { id: 'IND-24', group: 'entry', name: '九宫格 · 意见反馈', definition: '点击首页九宫格“意见反馈”入口的 PV/UV。', source: 'L1 埋点', primaryLabel: '点击 PV', primaryValue: 862, secondaryLabel: '点击 UV', secondaryValue: 740, comparisonRate: 5.9, sourceEntry: '首页九宫格' },
  { id: 'IND-25', group: 'entry', name: '九宫格 · 一键导航', definition: '点击首页九宫格“一键导航”入口的 PV/UV。', source: 'L1 埋点', primaryLabel: '点击 PV', primaryValue: 3415, secondaryLabel: '点击 UV', secondaryValue: 2860, comparisonRate: 11.6, sourceEntry: '首页九宫格' },
  { id: 'IND-26', group: 'entry', name: 'Tab · 首页', definition: '点击底部 Tab“首页”的 PV/UV。', source: 'L1 埋点', primaryLabel: '点击 PV', primaryValue: 4820, secondaryLabel: '点击 UV', secondaryValue: 3860, comparisonRate: 12.3, sourceEntry: '底部 Tab' },
  { id: 'IND-27', group: 'entry', name: 'Tab · 座位图', definition: '点击底部 Tab“座位图”的 PV/UV。', source: 'L1 埋点', primaryLabel: '点击 PV', primaryValue: 9120, secondaryLabel: '点击 UV', secondaryValue: 7340, comparisonRate: 17.4, sourceEntry: '底部 Tab' },
  { id: 'IND-28', group: 'entry', name: 'Tab · 停车', definition: '点击底部 Tab“停车”的 PV/UV。', source: 'L1 埋点', primaryLabel: '点击 PV', primaryValue: 15730, secondaryLabel: '点击 UV', secondaryValue: 11200, comparisonRate: 21.7, sourceEntry: '底部 Tab' },
  { id: 'IND-29', group: 'entry', name: 'Tab · 接驳', definition: '点击底部 Tab“接驳”的 PV/UV。', source: 'L1 埋点', primaryLabel: '点击 PV', primaryValue: 12480, secondaryLabel: '点击 UV', secondaryValue: 9860, comparisonRate: -3.2, sourceEntry: '底部 Tab' },
  { id: 'IND-30', group: 'entry', name: 'Tab · 收藏', definition: '点击底部 Tab“收藏”的 PV/UV。', source: 'L1 埋点', primaryLabel: '点击 PV', primaryValue: 4230, secondaryLabel: '点击 UV', secondaryValue: 3650, comparisonRate: 4.8, sourceEntry: '底部 Tab' },
  { id: 'IND-31', group: 'entry', name: '入场方案生成次数', definition: '完成座位检索并生成入场方案的 PV/UV。', source: 'L1 埋点', primaryLabel: '生成 PV', primaryValue: 2420, secondaryLabel: '生成 UV', secondaryValue: 1980, comparisonRate: 10.5, sourceEntry: '入场方案' },
  { id: 'IND-32', group: 'entry', name: '座位页收藏线路次数', definition: '座位页收藏推荐线路的点击 PV/UV。', source: 'L1 埋点', primaryLabel: '收藏 PV', primaryValue: 980, secondaryLabel: '收藏 UV', secondaryValue: 760, comparisonRate: 8.2, sourceEntry: '座位页面' },
  { id: 'IND-33', group: 'entry', name: '接驳页收藏线路次数', definition: '接驳页收藏接驳线路的点击 PV/UV。', source: 'L1 埋点', primaryLabel: '收藏 PV', primaryValue: 1240, secondaryLabel: '收藏 UV', secondaryValue: 980, comparisonRate: 6.1, sourceEntry: '接驳页面' },
  { id: 'IND-34', group: 'entry', name: '首页快捷查询次数', definition: '首页座位快捷查询条“查入场方案”的 PV/UV。', source: 'L1 埋点', primaryLabel: '查询 PV', primaryValue: 3560, secondaryLabel: '查询 UV', secondaryValue: 2940, comparisonRate: 9.8, sourceEntry: '首页快捷查询' },
  { id: 'IND-35', group: 'page', name: '停车场页面', definition: '停车页浏览次数与去重设备数。', source: 'L1 埋点', primaryLabel: '浏览 PV', primaryValue: 17850, secondaryLabel: '浏览 UV', secondaryValue: 12340, comparisonRate: 14.2, sourceEntry: '停车页面' },
  { id: 'IND-36', group: 'page', name: '接驳车页面', definition: '接驳页浏览次数与去重设备数。', source: 'L1 埋点', primaryLabel: '浏览 PV', primaryValue: 13260, secondaryLabel: '浏览 UV', secondaryValue: 9870, comparisonRate: -2.8, sourceEntry: '接驳页面' },
  { id: 'IND-37', group: 'page', name: '座位图页面', definition: '座位图页浏览次数与去重设备数。', source: 'L1 埋点', primaryLabel: '浏览 PV', primaryValue: 9480, secondaryLabel: '浏览 UV', secondaryValue: 7150, comparisonRate: 16.5, sourceEntry: '座位图页面' },
  { id: 'IND-38', group: 'page', name: '收藏页面', definition: '收藏页浏览次数与去重设备数。', source: 'L1 埋点', primaryLabel: '浏览 PV', primaryValue: 4960, secondaryLabel: '浏览 UV', secondaryValue: 3580, comparisonRate: 6.7, sourceEntry: '收藏页面' },
]

const ACTIVITIES: readonly DashboardActivityOption[] = [
  { id: 'activity-concert', name: '8 月 15 日演唱会', start: '2026-08-12', end: '2026-08-16' },
  { id: 'activity-football', name: '8 月 22 日足球赛', start: '2026-08-19', end: '2026-08-23' },
]

const DISTRIBUTIONS: readonly DashboardDistribution[] = [
  {
    id: 'parking-charge', title: '停车收费类型分布', description: '当前停车区配置', kind: 'donut', centerText: '10 个',
    slices: [{ key: 'free', label: '免费停车场', value: 4 }, { key: 'paid', label: '收费停车场', value: 6 }],
  },
  {
    id: 'control-status', title: '管制状态分布', description: '当前交通管制状态', kind: 'donut', centerText: '5 项',
    slices: [{ key: 'published', label: '已发布', value: 3 }, { key: 'draft', label: '草稿', value: 1 }, { key: 'revoked', label: '已撤销', value: 1 }],
  },
  {
    id: 'activity-status', title: '活动状态分布', description: '当前活动上下架状态', kind: 'donut', centerText: '3 场',
    slices: [{ key: 'online', label: '上架', value: 2 }, { key: 'offline', label: '下架', value: 1 }],
  },
  {
    id: 'shuttle-realtime', title: '接驳车实时数据可用率', description: '有实时数据线路数 / 线路总数', kind: 'progress', centerText: '80%',
    slices: [{ key: 'available', label: '已接入实时数据', value: 4 }, { key: 'unavailable', label: '未接入实时数据', value: 1 }],
  },
]

const PARKING_USAGE: readonly ParkingUsageItem[] = [
  { id: 'P1', name: 'P1', total: 500, used: 320, available: 180, usageRate: 64 },
  { id: 'P2', name: 'P2', total: 300, used: 180, available: 120, usageRate: 60 },
  { id: 'P3', name: 'P3', total: 200, used: 45, available: 155, usageRate: 22.5 },
  { id: 'P4', name: 'P4', total: 400, used: 368, available: 32, usageRate: 92 },
  { id: 'P5', name: 'P5', total: 150, used: 150, available: 0, usageRate: 100 },
  { id: 'P6', name: 'P6', total: 200, used: 60, available: 140, usageRate: 30 },
]

const INITIAL_VR_WORKS: readonly VrWorkMetric[] = [
  { id: 'vr-1', rank: 1, title: '体育中心全景导览', coverLabel: 'VR', bindingType: 'manual', pv: 45230, likes: 3102, sceneCount: 12, uv: null, shares: null, messages: null, phoneClicks: null, lastSyncedAt: '2026-08-13T10:00:00.000Z', availability: 'active' },
  { id: 'vr-2', rank: 2, title: '场馆入口与检票口导览', coverLabel: 'VR', bindingType: 'manual', pv: 28940, likes: 1876, sceneCount: 8, uv: null, shares: null, messages: null, phoneClicks: null, lastSyncedAt: '2026-08-13T10:00:00.000Z', availability: 'active' },
  { id: 'vr-3', rank: 3, title: '座位区 3D 俯瞰', coverLabel: 'VR', bindingType: 'manual', pv: 19580, likes: 1205, sceneCount: 6, uv: null, shares: null, messages: null, phoneClicks: null, lastSyncedAt: '2026-08-13T10:00:00.000Z', availability: 'active' },
]

const TREND_WEIGHTS = [0.78, 0.9, 1, 1.12, 1.24, 1.1, 0.96] as const

function hashText(value: string): number {
  let hash = 0
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) % 9973
  return hash
}

function distributeTotal(total: number, count: number, salt: number): number[] {
  if (count <= 0) return []
  const weights = Array.from({ length: count }, (_, index) => {
    const base = TREND_WEIGHTS[(index + salt) % TREND_WEIGHTS.length]!
    return base * (0.96 + ((salt + index * 7) % 9) / 100)
  })
  const weightSum = weights.reduce((sum, value) => sum + value, 0)
  const values = weights.map((weight) => Math.max(0, Math.round(total * weight / weightSum)))
  const difference = total - values.reduce((sum, value) => sum + value, 0)
  values[values.length - 1] = Math.max(0, values[values.length - 1]! + difference)
  return values
}

function datesInRange(range: DashboardDateRange): string[] {
  const count = inclusiveDayCount(range)
  const start = parseDashboardDate(range.start)
  return Array.from({ length: count }, (_, index) => toDashboardDate(addDays(start, index)))
}

function scaledValue(baseValue: number, range: DashboardDateRange, salt: number): number {
  const count = inclusiveDayCount(range)
  if (count === 7) return baseValue
  const dateFactor = 0.9 + (hashText(`${range.start}:${salt}`) % 21) / 100
  return Math.max(0, Math.round(baseValue * count / 7 * dateFactor))
}

function buildMetric(seed: MetricSeed, range: DashboardDateRange, updatedAt: string): DashboardMetric {
  const salt = hashText(seed.id) % TREND_WEIGHTS.length
  const primaryValue = scaledValue(seed.primaryValue, range, salt)
  const secondaryValue = seed.secondaryValue === null ? null : scaledValue(seed.secondaryValue, range, salt + 3)
  const dates = datesInRange(range)
  const primaryTrend = distributeTotal(primaryValue, dates.length, salt)
  const secondaryTrend = secondaryValue === null ? [] : distributeTotal(secondaryValue, dates.length, salt + 3)
  const trend: DashboardTrendPoint[] = dates.map((date, index) => ({
    date,
    primary: primaryTrend[index] ?? 0,
    secondary: secondaryValue === null ? null : (secondaryTrend[index] ?? 0),
  }))
  return {
    id: seed.id,
    group: seed.group,
    name: seed.name,
    definition: seed.definition,
    source: seed.source,
    primaryLabel: seed.primaryLabel,
    primaryValue,
    secondaryLabel: seed.secondaryLabel,
    secondaryValue,
    comparisonRate: seed.comparisonRate,
    availability: 'ready',
    updatedAt,
    trend,
  }
}

function buildOperations(range: DashboardDateRange, updatedAt: string): DashboardOperationsSnapshot {
  return {
    range: clone(range),
    metrics: METRIC_SEEDS.map((seed) => buildMetric(seed, range, updatedAt)),
    updatedAt,
  }
}

function detailSource(metricId: string): string {
  return METRIC_SEEDS.find((seed) => seed.id === metricId)?.sourceEntry ?? '未知入口'
}

function defaultDistributionDetails(distributionId: string, sliceKey: string, updatedAt: string): DistributionDetailRow[] {
  const definitions: Record<string, Record<string, readonly string[]>> = {
    'parking-charge': {
      free: ['P3 停车场', 'P6 停车场', '北广场临时停车区', '媒体停车区'],
      paid: ['P1 停车场', 'P2 停车场', 'P4 停车场', 'P5 停车场', '贵宾停车区', '社会车辆停车区'],
    },
    'control-status': {
      published: ['体育路北段临时管制', '场馆东路单向通行', '演唱会散场分流'],
      draft: ['足球赛赛前管制方案'],
      revoked: ['全民健身日临时管制'],
    },
    'activity-status': {
      online: ['8 月 15 日演唱会', '8 月 22 日足球赛'],
      offline: ['全民健身日活动'],
    },
    'shuttle-realtime': {
      available: ['火车站接驳线', '高铁西站接驳线', '中心广场接驳线', '神农城接驳线'],
      unavailable: ['备用循环接驳线'],
    },
  }
  const distribution = DISTRIBUTIONS.find((item) => item.id === distributionId)
  const slice = distribution?.slices.find((item) => item.key === sliceKey)
  return (definitions[distributionId]?.[sliceKey] ?? []).map((name, index) => ({
    id: `${distributionId}-${sliceKey}-${index + 1}`,
    objectName: name,
    category: slice?.label ?? '当前分类',
    value: '当前配置',
    updatedAt,
  }))
}

export class MockDashboardService implements DashboardService {
  private readonly now: () => Date
  private readonly failSyncForIds: ReadonlySet<string>
  private readonly syncDelayMs: number
  private vrWorks: VrWorkMetric[]

  constructor(options: MockDashboardServiceOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.failSyncForIds = options.failSyncForIds ?? new Set()
    this.syncDelayMs = Math.max(0, options.syncDelayMs ?? 600)
    this.vrWorks = INITIAL_VR_WORKS.map(clone)
  }

  async loadDashboard(range: DashboardDateRange): Promise<DashboardSnapshot> {
    const normalizedRange = normalizeDashboardRange(range, this.now())
    const updatedAt = this.now().toISOString()
    return {
      activities: ACTIVITIES.map(clone),
      operations: buildOperations(normalizedRange, updatedAt),
      distributions: DISTRIBUTIONS.map(clone),
      parkingUsage: PARKING_USAGE.map(clone),
      vrWorks: this.vrWorks.map(clone),
      currentDataUpdatedAt: updatedAt,
    }
  }

  async loadOperations(range: DashboardDateRange): Promise<DashboardOperationsSnapshot> {
    return buildOperations(normalizeDashboardRange(range, this.now()), this.now().toISOString())
  }

  async getMetricDetails(
    metricId: string,
    dimension: DashboardMetricDimension,
    range: DashboardDateRange,
    page: number,
    pageSize: number,
  ): Promise<MetricDetailPage> {
    const all = await this.getAllMetricDetails(metricId, dimension, range)
    const safePageSize = Math.max(1, Math.trunc(pageSize) || 20)
    const maxPage = Math.max(1, Math.ceil(all.length / safePageSize))
    const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), maxPage)
    const start = (safePage - 1) * safePageSize
    return { items: all.slice(start, start + safePageSize), total: all.length, page: safePage, pageSize: safePageSize }
  }

  async getAllMetricDetails(
    metricId: string,
    dimension: DashboardMetricDimension,
    range: DashboardDateRange,
  ): Promise<DashboardMetricDetail[]> {
    const seed = METRIC_SEEDS.find((item) => item.id === metricId)
    if (!seed) throw new DashboardServiceError('未找到指标')
    if (dimension === 'secondary' && seed.secondaryValue === null) throw new DashboardServiceError('当前指标没有次级数据')
    const metric = buildMetric(seed, normalizeDashboardRange(range, this.now()), this.now().toISOString())
    return metric.trend.map((point) => ({
      id: `${metric.id}-${dimension}-${point.date}`,
      date: point.date,
      value: dimension === 'secondary' ? (point.secondary ?? 0) : point.primary,
      sourceEntry: detailSource(metric.id),
    }))
  }

  async getDistributionDetails(distributionId: string, sliceKey: string): Promise<DistributionDetailRow[]> {
    if (distributionId === 'parking-usage') {
      const parking = PARKING_USAGE.find((item) => item.id === sliceKey)
      if (!parking) throw new DashboardServiceError('未找到停车场数据')
      return [{
        id: `parking-usage-${parking.id}`,
        objectName: `${parking.name} 停车场`,
        category: '车位使用情况',
        value: `已用 ${parking.used} / 总计 ${parking.total}，剩余 ${parking.available}，使用率 ${parking.usageRate}%`,
        updatedAt: this.now().toISOString(),
      }]
    }
    const rows = defaultDistributionDetails(distributionId, sliceKey, this.now().toISOString())
    if (!rows.length) throw new DashboardServiceError('未找到分布明细')
    return rows
  }

  async syncVrWork(id: string): Promise<VrWorkMetric> {
    const work = this.vrWorks.find((item) => item.id === id)
    if (!work) throw new DashboardServiceError('未找到 VR 作品')
    if (this.syncDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.syncDelayMs))
    if (this.failSyncForIds.has(id)) throw new DashboardServiceError('720 云示例源同步失败，可稍后重试')
    work.pv += work.rank * 41
    work.likes += work.rank
    work.lastSyncedAt = this.now().toISOString()
    this.vrWorks.sort((left, right) => right.pv - left.pv)
    this.vrWorks.forEach((item, index) => { item.rank = index + 1 })
    return clone(work)
  }
}

export const dashboardService: DashboardService = new MockDashboardService()

export const DASHBOARD_METRIC_COUNTS: Readonly<Record<DashboardMetricGroup, number>> = {
  core: METRIC_SEEDS.filter((item) => item.group === 'core').length,
  entry: METRIC_SEEDS.filter((item) => item.group === 'entry').length,
  page: METRIC_SEEDS.filter((item) => item.group === 'page').length,
}
