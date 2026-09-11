import type { ParkingUsageItem } from '../types'

export const PARKING_USAGE_LIMIT = 8
export type ParkingUsageFilter = 'all' | 'full' | 'high' | 'available'
export type ParkingUsageSort = 'usage-desc' | 'usage-asc' | 'available-desc'
export type ParkingUsageStatus = 'full' | 'high' | 'available' | 'unknown' | 'unconfigured'

export const PARKING_USAGE_FILTERS: readonly { value: ParkingUsageFilter, label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'full', label: '已满' },
  { value: 'high', label: '高占用 ≥60%' },
  { value: 'available', label: '有空位' },
]

export const PARKING_USAGE_SORTS: readonly { value: ParkingUsageSort, label: string, description: string }[] = [
  { value: 'usage-desc', label: '使用率：从高到低', description: '使用率从高到低' },
  { value: 'usage-asc', label: '使用率：从低到高', description: '使用率从低到高' },
  { value: 'available-desc', label: '剩余车位：从多到少', description: '剩余车位从多到少' },
]

export function parkingUsageRate(item: ParkingUsageItem): number | null {
  if (item.total <= 0) return null
  // Use exact counts for ranking and thresholds, avoiding rounded 59.96% / 99.96% rates.
  if (item.available !== null) return Math.max(0, item.total - item.available) / item.total * 100
  return item.usageRate
}

export function parkingUsageStatus(item: ParkingUsageItem): ParkingUsageStatus {
  if (item.total <= 0) return 'unconfigured'
  if (item.available === null) return 'unknown'
  if (item.available === 0) return 'full'
  return (parkingUsageRate(item) ?? 0) >= 60 ? 'high' : 'available'
}

export function formatParkingUsageRate(rate: number | null): string {
  if (rate === null) return '—'
  // Truncate at one decimal so displayed percentages cannot cross a status threshold.
  return `${Math.floor(rate * 10 + 1e-9) / 10}%`
}

export function summarizeParkingUsage(items: readonly ParkingUsageItem[]) {
  const unknownCount = items.filter(item => item.available === null && item.total > 0).length
  return {
    total: items.reduce((sum, item) => sum + item.total, 0),
    used: unknownCount ? null : items.reduce((sum, item) => sum + item.used, 0),
    available: unknownCount ? null : items.reduce((sum, item) => sum + (item.available ?? 0), 0),
    full: unknownCount ? null : items.filter(item => parkingUsageStatus(item) === 'full').length,
    high: unknownCount ? null : items.filter(item => parkingUsageStatus(item) === 'high').length,
    unknownCount,
  }
}

export function selectParkingUsage(
  items: readonly ParkingUsageItem[],
  filter: ParkingUsageFilter,
  sort: ParkingUsageSort,
) {
  const matches = items.filter(item => {
    if (filter === 'all') return true
    if (filter === 'available') return item.total > 0 && item.available !== null && item.available > 0
    return parkingUsageStatus(item) === filter
  })
  matches.sort((first, second) => {
    const firstValue = sort === 'available-desc' ? first.available : parkingUsageRate(first)
    const secondValue = sort === 'available-desc' ? second.available : parkingUsageRate(second)
    // Unknown values stay at the bottom in both directions.
    if (firstValue === null && secondValue !== null) return 1
    if (secondValue === null && firstValue !== null) return -1
    const difference = firstValue === null || secondValue === null ? 0 : firstValue - secondValue
    return (sort === 'usage-asc' ? difference : -difference)
      || first.id.localeCompare(second.id, 'en', { numeric: true })
  })
  return { items: matches.slice(0, PARKING_USAGE_LIMIT), matchedCount: matches.length }
}
