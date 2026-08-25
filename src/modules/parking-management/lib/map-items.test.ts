import type { ParkingLot } from '../types'
import { describe, expect, it } from 'vitest'
import {
  PARKING_AVAILABILITY_COLORS,
  createParkingMapItems,
  deriveParkingAvailabilityLevel,
  formatParkingFee,
  parkingAvailabilityLabel,
  parkingMarkerColor,
} from './map-items'

function lot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'parking-1',
    code: 'P-01',
    name: '测试停车场',
    locationDescription: '',
    point: { lng: 113.1462, lat: 27.8165 },
    navigationAddress: '',
    totalSpaces: 100,
    availableSpaces: 31,
    feeType: 'free',
    feeStandard: '',
    openStatus: 'open',
    enabled: true,
    recommendationWeight: 50,
    sortOrder: 1,
    remark: '',
    coordinateSystem: 'GCJ-02',
    availabilityUpdatedAt: '2026-08-18T00:00:00.000Z',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('parking map items', () => {
  it('derives the three availability levels at exact thresholds', () => {
    expect(deriveParkingAvailabilityLevel(lot({ availableSpaces: 31 }))).toBe('ample')
    expect(deriveParkingAvailabilityLevel(lot({ availableSpaces: 30 }))).toBe('tight')
    expect(deriveParkingAvailabilityLevel(lot({ availableSpaces: 11 }))).toBe('tight')
    expect(deriveParkingAvailabilityLevel(lot({ availableSpaces: 10 }))).toBe('nearly-full')
    expect(parkingAvailabilityLabel(lot({ availableSpaces: 0 }))).toBe('已满')
  })

  it('uses neutral markers for closed or disabled records', () => {
    expect(parkingMarkerColor(lot({ openStatus: 'closed' }))).toBe(PARKING_AVAILABILITY_COLORS.inactive)
    expect(parkingMarkerColor(lot({ enabled: false }))).toBe(PARKING_AVAILABILITY_COLORS.inactive)
  })

  it('formats fees and omits missing coordinates while retaining selection', () => {
    const paid = lot({ feeType: 'paid', feeStandard: '首小时 5 元，之后每小时 2 元' })
    expect(formatParkingFee(paid)).toBe('首小时 5 元，之后每小时 2 元')
    const result = createParkingMapItems([paid, lot({ id: 'missing', point: null })], paid.id)
    expect(result).toMatchObject({ missingCount: 1, mappedCount: 1 })
    expect(result.markers[0]).toMatchObject({
      selected: true,
      description: '余 31/100 · 首小时 5 元，之后每小时 2 元',
    })
  })
})
