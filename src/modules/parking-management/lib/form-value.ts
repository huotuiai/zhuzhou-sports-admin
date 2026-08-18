import type {
  ParkingLot,
  ParkingLotCreateInput,
  ParkingLotFormValue,
  ParkingLotUpdateInput,
} from '../types'
import { parseGeoPointInput, serializeGeoPoint } from '@/components/map/geometry'

export function parkingLotFormToCreateInput(value: ParkingLotFormValue): ParkingLotCreateInput {
  const { coordinateInput, ...input } = value
  return {
    ...input,
    point: coordinateInput.trim() ? parseGeoPointInput(coordinateInput) : null,
  }
}

export function parkingLotFormToUpdateInput(value: ParkingLotFormValue): ParkingLotUpdateInput {
  const input = parkingLotFormToCreateInput(value)
  return {
    name: input.name,
    locationDescription: input.locationDescription,
    point: input.point,
    navigationAddress: input.navigationAddress,
    totalSpaces: input.totalSpaces,
    feeType: input.feeType,
    hourlyRateYuan: input.hourlyRateYuan,
    openStatus: input.openStatus,
    enabled: input.enabled,
    recommendationWeight: input.recommendationWeight,
    sortOrder: input.sortOrder,
    remark: input.remark,
  }
}

export function parkingLotToFormValue(record: ParkingLot): ParkingLotFormValue {
  return {
    code: record.code,
    name: record.name,
    locationDescription: record.locationDescription,
    coordinateInput: record.point ? serializeGeoPoint(record.point) : '',
    navigationAddress: record.navigationAddress,
    totalSpaces: record.totalSpaces,
    feeType: record.feeType,
    hourlyRateYuan: record.hourlyRateYuan,
    openStatus: record.openStatus,
    enabled: record.enabled,
    recommendationWeight: record.recommendationWeight,
    sortOrder: record.sortOrder,
    remark: record.remark,
  }
}
