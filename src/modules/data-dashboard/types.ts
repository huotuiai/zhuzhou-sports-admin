export type DashboardDatePreset = 'today' | 'yesterday' | 'last-7-days' | 'last-30-days' | 'custom'
export type DashboardMetricGroup = 'entry' | 'page'
export type DashboardMetricDimension = 'primary' | 'secondary'
export type DashboardMetricAvailability = 'ready' | 'pending'

export interface DashboardDateRange {
  start: string
  end: string
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
  start: string
  end: string
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
  comparisonRate: number | null
  availability: DashboardMetricAvailability
  updatedAt: string
  trend: DashboardTrendPoint[]
}

export interface DashboardOperationsSnapshot {
  range: DashboardDateRange
  metrics: DashboardMetric[]
  updatedAt: string
}

export interface DashboardMetricDetail {
  id: string
  date: string
  value: number
  sourceEntry: string
}

export interface MetricDetailPage {
  items: DashboardMetricDetail[]
  total: number
  page: number
  pageSize: number
}

export type DashboardDistributionKind = 'donut' | 'progress'

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
  centerText: string | null
  slices: DashboardDistributionSlice[]
}

export interface ParkingUsageItem {
  id: string
  name: string
  total: number
  used: number
  available: number
  usageRate: number
}

export interface DistributionDetailRow {
  id: string
  objectName: string
  category: string
  value: string
  updatedAt: string
}

export type VrBindingType = 'manual' | 'external'

export interface VrWorkMetric {
  id: string
  rank: number
  title: string
  coverLabel: string
  bindingType: VrBindingType
  pv: number
  likes: number
  sceneCount: number
  lastSyncedAt: string
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
  loadDashboard(range: DashboardDateRange): Promise<DashboardSnapshot>
  loadOperations(range: DashboardDateRange): Promise<DashboardOperationsSnapshot>
  getMetricDetails(
    metricId: string,
    dimension: DashboardMetricDimension,
    range: DashboardDateRange,
    page: number,
    pageSize: number,
  ): Promise<MetricDetailPage>
  getAllMetricDetails(
    metricId: string,
    dimension: DashboardMetricDimension,
    range: DashboardDateRange,
  ): Promise<DashboardMetricDetail[]>
  getDistributionDetails(distributionId: string, sliceKey: string): Promise<DistributionDetailRow[]>
  syncVrWork(id: string): Promise<VrWorkMetric>
}
