export type DashboardDatePreset = 'today' | 'yesterday' | 'last-7-days' | 'last-30-days' | 'custom'
export type DashboardMetricGroup = 'entry' | 'page'
export type DashboardMetricDimension = 'primary' | 'secondary'

export interface DashboardDateRange {
  start: string
  end: string
}

export interface DashboardStatsQuery extends DashboardDateRange {
  preset: DashboardDatePreset
  activityId: string
}

export interface DashboardFilterState {
  preset: DashboardDatePreset
  customStart: string
  customEnd: string
  activityId: string
}

export interface DashboardActivityOption {
  id: string
  name: string
  start: string | null
  end: string | null
}

export interface DashboardTrendPoint {
  date: string
  primary: number
  secondary: number | null
}

export interface DashboardMetric {
  id: string
  group: DashboardMetricGroup
  name: string
  definition: string
  source: string
  primaryLabel: string
  primaryValue: number
  secondaryLabel: string | null
  secondaryValue: number | null
  previousValue: number
  comparisonRate: number | null
  comparisonText: string
  updatedAt: string
  trend: DashboardTrendPoint[]
}

export interface DashboardOperationsSnapshot {
  query: DashboardStatsQuery
  range: DashboardDateRange
  metrics: DashboardMetric[]
  updatedAt: string
}

export interface DashboardOperationsResult {
  activities: DashboardActivityOption[]
  operations: DashboardOperationsSnapshot
}

export interface DashboardMetricDetail {
  id: string
  occurredAt: string
  eventName: string
  deviceId: string | null
  page: string | null
  referenceType: string | null
  referenceId: string | null
  extraJson: string | null
  ip: string | null
  createdAt: string
  updatedAt: string
}

export interface MetricDetailPage {
  items: DashboardMetricDetail[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardExportFile {
  content: Blob
  filename: string
}

export type DashboardDistributionKind = 'donut' | 'progress'
export type DashboardDistributionDetailKind = 'parking_fee' | 'parking_remain' | 'control' | 'activity'

export interface DashboardDistributionSlice {
  key: string
  label: string
  value: number
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'muted'
}

export interface DashboardDistribution {
  id: string
  title: string
  description: string
  kind: DashboardDistributionKind
  detailKind: Exclude<DashboardDistributionDetailKind, 'parking_remain'>
  centerText: string | null
  slices: DashboardDistributionSlice[]
}

export interface ParkingUsageItem {
  id: string
  name: string
  total: number
  used: number
  available: number | null
  usageRate: number
}

export interface DashboardDistributionDetailSelection {
  kind: DashboardDistributionDetailKind
  slice: string
  title: string
  label: string
}

export interface DashboardDistributionDetail {
  id: string
  code: string
  name: string
  extra: string
}

export interface DistributionDetailPage {
  items: DashboardDistributionDetail[]
  total: number
  page: number
  pageSize: number
}

export interface VrWorkMetric {
  id: string
  rank: number
  externalId: string
  title: string
  coverUrl: string | null
  bindingObject: string | null
  pv: number
  uv: number | null
  likes: number
  shares: number | null
  comments: number | null
  phoneClicks: number | null
  sceneCount: number
  lastSyncedAt: string | null
  isInvalid: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface DashboardVrSyncResult {
  sourceId: string
  result: 'success' | 'fail'
  summary: string
  disabled: boolean
}

export interface DashboardSnapshot {
  activities: DashboardActivityOption[]
  operations: DashboardOperationsSnapshot
  distributions: DashboardDistribution[]
  parkingUsage: ParkingUsageItem[]
  vrWorks: VrWorkMetric[]
  currentDataUpdatedAt: string
}

export interface DashboardService {
  loadDashboard(query: DashboardStatsQuery): Promise<DashboardSnapshot>
  loadOperations(query: DashboardStatsQuery): Promise<DashboardOperationsResult>
  loadMetricTrend(metricId: string, query: DashboardStatsQuery): Promise<DashboardTrendPoint[]>
  getMetricDetails(metricId: string, query: DashboardStatsQuery, page: number, pageSize: number): Promise<MetricDetailPage>
  exportMetricDetails(metricId: string, query: DashboardStatsQuery): Promise<DashboardExportFile>
  loadDistributions(): Promise<{ distributions: DashboardDistribution[], parkingUsage: ParkingUsageItem[] }>
  getDistributionDetails(kind: DashboardDistributionDetailKind, slice: string, page: number, pageSize: number): Promise<DistributionDetailPage>
  loadVrWorks(): Promise<VrWorkMetric[]>
  syncVrWorks(): Promise<DashboardVrSyncResult>
}
