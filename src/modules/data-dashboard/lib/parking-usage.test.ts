import { describe, expect, it } from 'vitest'
import type { ParkingUsageItem } from '../types'
import { formatParkingUsageRate, parkingUsageRate, parkingUsageStatus, selectParkingUsage, summarizeParkingUsage } from './parking-usage'

function parking(id: string, total: number, available: number | null, usageRate = 0): ParkingUsageItem {
  return { id, name: id, total, available, used: available === null ? 0 : total - available, usageRate }
}

describe('parking usage table data', () => {
  it('filters and sorts the full snapshot before selecting eight rows without changing the source', () => {
    const items = Array.from({ length: 12 }, (_, index) => parking(String(index + 1), 100, index * 8))
    const original = [...items]
    expect(selectParkingUsage(items, 'all', 'usage-desc').items.map(item => item.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
    expect(selectParkingUsage(items, 'all', 'usage-asc').items.map(item => item.id)).toEqual(['12', '11', '10', '9', '8', '7', '6', '5'])
    expect(selectParkingUsage(items, 'available', 'available-desc')).toMatchObject({ matchedCount: 11 })
    expect(selectParkingUsage(items, 'full', 'usage-desc').items.map(item => item.id)).toEqual(['1'])
    expect(selectParkingUsage(items, 'high', 'usage-desc').items.map(item => item.id)).toEqual(['2', '3', '4', '5', '6'])
    expect(items).toEqual(original)
    expect(summarizeParkingUsage(items)).toEqual({ total: 1200, used: 672, available: 528, full: 1, high: 5, unknownCount: 0 })
  })

  it('ranks by the requested metric, with deterministic ties and unknown values last', () => {
    const items = [parking('10', 100, 50), parking('2', 200, 100), parking('3', 100, null, 90), parking('4', 0, 0)]
    expect(selectParkingUsage(items, 'all', 'usage-desc').items.map(item => item.id)).toEqual(['3', '2', '10', '4'])
    expect(selectParkingUsage(items, 'all', 'usage-asc').items.map(item => item.id)).toEqual(['2', '10', '3', '4'])
    expect(selectParkingUsage(items, 'all', 'available-desc').items.map(item => item.id)).toEqual(['2', '10', '4', '3'])
  })

  it('uses actual counts at 60% and 100% boundaries instead of rounded API usage', () => {
    const cases = [
      { item: parking('near-high', 10000, 4004, 60), label: '59.9%', status: 'available' },
      { item: parking('high', 100, 40, 60), label: '60%', status: 'high' },
      { item: parking('near-full', 10000, 4, 100), label: '99.9%', status: 'high' },
      { item: parking('full', 100, 0, 100), label: '100%', status: 'full' },
      { item: parking('unconfigured', 0, 0, 0), label: '—', status: 'unconfigured' },
    ]
    for (const { item, label, status } of cases) {
      expect(parkingUsageStatus(item)).toBe(status)
      expect(formatParkingUsageRate(parkingUsageRate(item))).toBe(label)
    }
  })

  it('does not treat unknown availability as full or publish incomplete totals as complete', () => {
    const unknown = parking('unknown', 100, null, 100)
    expect(parkingUsageStatus(unknown)).toBe('unknown')
    expect(selectParkingUsage([unknown], 'full', 'usage-desc').matchedCount).toBe(0)
    expect(selectParkingUsage([unknown], 'available', 'usage-desc').matchedCount).toBe(0)
    expect(summarizeParkingUsage([unknown, parking('known', 100, 20)])).toEqual({
      total: 200, used: null, available: null, full: null, high: null, unknownCount: 1,
    })
    expect(selectParkingUsage([], 'all', 'usage-desc')).toEqual({ items: [], matchedCount: 0 })
  })
})
