import type { ParkingLot, ParkingLotFormValue } from '../types'
import { describe, expect, it } from 'vitest'
import {
  parkingLotFormToCreateInput,
  parkingLotFormToUpdateInput,
  parkingLotToFormValue,
} from './form-value'

function formValue(overrides: Partial<ParkingLotFormValue> = {}): ParkingLotFormValue {
  return {
    code: 'P-001',
    name: '体育中心停车场',
    locationDescription: '东广场',
    coordinateInput: '113.1462,27.8165',
    navigationAddress: '株洲市天元区',
    totalSpaces: 100,
    availabilityUpdateMethod: 'manual',
    feeType: 'free',
    feeStandard: '',
    openStatus: 'open',
    enabled: true,
    recommendationWeight: 50,
    sortOrder: 1,
    remark: '',
    nearbyGateBindings: [],
    ...overrides,
  }
}

function parkingLot(overrides: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: '9007199254740999',
    code: 'P-001',
    name: '体育中心停车场',
    locationDescription: '东广场',
    point: { lng: 113.1462, lat: 27.8165 },
    navigationAddress: '株洲市天元区',
    totalSpaces: 100,
    availableSpaces: 80,
    availabilityUpdateMethod: 'integrated',
    feeType: 'free',
    feeStandard: '',
    openStatus: 'open',
    enabled: true,
    recommendationWeight: 50,
    sortOrder: 1,
    remark: '',
    coordinateSystem: 'GCJ-02',
    availabilityUpdatedAt: '2026-08-28T02:00:00.000Z',
    createdAt: '2026-08-28T01:00:00.000Z',
    updatedAt: '2026-08-28T02:00:00.000Z',
    ...overrides,
  }
}

describe('parking lot form value mapping', () => {
  it('always creates new parking lots with manual availability updates', () => {
    expect(parkingLotFormToCreateInput(formValue({ availabilityUpdateMethod: 'integrated' })))
      .toMatchObject({ availabilityUpdateMethod: 'manual' })
  })

  it('preserves the existing availability update method while editing', () => {
    const value = parkingLotToFormValue(parkingLot())
    expect(value.availabilityUpdateMethod).toBe('integrated')
    expect(parkingLotFormToUpdateInput(value).availabilityUpdateMethod).toBe('integrated')
  })
})
