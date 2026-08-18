import type { MapMarkerItem } from '@/components/map/types'
import type { ParkingAvailabilityLevel, ParkingLot } from '../types'

export const PARKING_AVAILABILITY_COLORS: Record<ParkingAvailabilityLevel | 'inactive', string> = {
  ample: '#16a34a',
  tight: '#f59e0b',
  'nearly-full': '#dc2626',
  inactive: '#64748b',
}

export interface ParkingMapItems {
  markers: MapMarkerItem[]
  missingCount: number
  mappedCount: number
}

export function deriveParkingAvailabilityLevel(
  record: Pick<ParkingLot, 'availableSpaces' | 'totalSpaces'>,
): ParkingAvailabilityLevel {
  const ratio = record.totalSpaces > 0 ? record.availableSpaces / record.totalSpaces : 0
  if (ratio > 0.3) return 'ample'
  if (ratio > 0.1) return 'tight'
  return 'nearly-full'
}

export function parkingAvailabilityLabel(
  record: Pick<ParkingLot, 'availableSpaces' | 'totalSpaces'>,
): string {
  if (record.availableSpaces === 0) return '已满'
  const level = deriveParkingAvailabilityLevel(record)
  if (level === 'ample') return '空位充足'
  if (level === 'tight') return '空位紧张'
  return '即将满位'
}

export function formatParkingFee(record: Pick<ParkingLot, 'feeType' | 'hourlyRateYuan'>): string {
  if (record.feeType === 'free') return '免费'
  return record.hourlyRateYuan === null ? '收费' : `${record.hourlyRateYuan.toLocaleString('zh-CN')} 元/小时`
}

export function parkingMarkerColor(
  record: Pick<ParkingLot, 'enabled' | 'openStatus' | 'availableSpaces' | 'totalSpaces'>,
): string {
  if (!record.enabled || record.openStatus === 'closed') return PARKING_AVAILABILITY_COLORS.inactive
  return PARKING_AVAILABILITY_COLORS[deriveParkingAvailabilityLevel(record)]
}

export function createParkingMapItems(records: readonly ParkingLot[], selectedId: string | null): ParkingMapItems {
  const markers: MapMarkerItem[] = []
  let missingCount = 0
  for (const record of records) {
    if (!record.point) {
      missingCount += 1
      continue
    }
    const inactiveText = !record.enabled ? '已停用' : record.openStatus === 'closed' ? '已关闭' : null
    markers.push({
      id: record.id,
      point: { ...record.point },
      label: `${record.code} · ${record.name}`,
      description: inactiveText ?? `余 ${record.availableSpaces}/${record.totalSpaces} · ${formatParkingFee(record)}`,
      color: parkingMarkerColor(record),
      selected: record.id === selectedId,
    })
  }
  return { markers, missingCount, mappedCount: markers.length }
}
