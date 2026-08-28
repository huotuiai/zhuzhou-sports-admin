import type {
  ParkingLot,
  ParkingLotCreateInput,
  ParkingLotFormValue,
  ParkingLotUpdateInput,
} from '../types'
import { parseGeoPointInput, serializeGeoPoint } from '@/components/map/geometry'

function parkingLotFormToBaseInput(value: ParkingLotFormValue): ParkingLotUpdateInput {
  return {
    name: value.name,
    locationDescription: value.locationDescription,
    point: value.coordinateInput.trim() ? parseGeoPointInput(value.coordinateInput) : null,
    navigationAddress: value.navigationAddress,
    totalSpaces: value.totalSpaces,
    availabilityUpdateMethod: value.availabilityUpdateMethod,
    feeType: value.feeType,
    feeStandard: value.feeStandard,
    openStatus: value.openStatus,
    enabled: value.enabled,
    recommendationWeight: value.recommendationWeight,
    sortOrder: value.sortOrder,
    remark: value.remark,
  }
}

export function parkingLotFormToCreateInput(value: ParkingLotFormValue): ParkingLotCreateInput {
  return {
    ...parkingLotFormToBaseInput(value),
    code: value.code,
    availabilityUpdateMethod: 'manual',
  }
}

export function parkingLotFormToUpdateInput(value: ParkingLotFormValue): ParkingLotUpdateInput {
  return parkingLotFormToBaseInput(value)
}

export function parkingLotToFormValue(
  record: ParkingLot,
  nearbyGateBindings: ParkingLotFormValue['nearbyGateBindings'] = [],
): ParkingLotFormValue {
  return {
    code: record.code,
    name: record.name,
    locationDescription: record.locationDescription,
    coordinateInput: record.point ? serializeGeoPoint(record.point) : '',
    navigationAddress: record.navigationAddress,
    totalSpaces: record.totalSpaces,
    availabilityUpdateMethod: record.availabilityUpdateMethod,
    feeType: record.feeType,
    feeStandard: record.feeStandard,
    openStatus: record.openStatus,
    enabled: record.enabled,
    recommendationWeight: record.recommendationWeight,
    sortOrder: record.sortOrder,
    remark: record.remark,
    nearbyGateBindings: nearbyGateBindings.map((binding) => ({ ...binding })),
  }
}
