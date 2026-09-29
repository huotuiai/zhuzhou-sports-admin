export type SecurityPeriod = 'early' | 'morning' | 'afternoon' | 'evening'

export interface ObservationWindow {
  date: string
  period: SecurityPeriod
}

export type SecurityMetricKey = 'online' | 'sample' | 'entry-guide' | 'exit-guide' | 'map-navigation' | 'vr-navigation' | 'inside' | 'perimeter' | 'approaching'

export interface SecurityMetric {
  key: SecurityMetricKey
  label: string
  value: number
  description: string
}

export interface SecurityActivity {
  id: string
  name: string
  startAt: string
  endAt: string
}

export interface SecurityRankingItem {
  id: string
  label: string
  count: number
}

export interface SecurityRanking {
  id: string
  title: string
  description: string
  total: number
  limit?: 6 | 12
  wide?: boolean
  items: readonly SecurityRankingItem[]
}

/** Presentation model only; it deliberately does not prescribe a future API response. */
export interface SecurityDataSnapshot {
  metrics: readonly SecurityMetric[]
  activities: readonly SecurityActivity[]
  rankings: readonly SecurityRanking[]
}
