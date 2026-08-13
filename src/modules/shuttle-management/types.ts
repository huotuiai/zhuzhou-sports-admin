export interface ShuttleVehicle {
  id: string
  name: string
  plateNumber: string
  capacity: number
}

export interface ShuttleStation {
  id: string
  name: string
}

export interface ShuttlePoint {
  id: string
  name: string
  code: string
  address: string
  contactName: string
  contactPhone: string
  routeName: string
  stations: ShuttleStation[]
  vehicles: ShuttleVehicle[]
  firstDeparture: string
  lastDeparture: string
  departureInterval: number
  enabled: boolean
  remark: string
  createdAt: string
  updatedAt: string
}

export type ShuttlePointWriteInput = Omit<ShuttlePoint, 'id' | 'createdAt' | 'updatedAt'>

export interface ShuttlePointService {
  list(): Promise<ShuttlePoint[]>
  create(input: ShuttlePointWriteInput): Promise<ShuttlePoint>
  update(id: string, input: ShuttlePointWriteInput): Promise<ShuttlePoint>
  remove(id: string): Promise<void>
}

export type ShuttlePointStatusFilter = 'all' | 'enabled' | 'disabled'

export interface ShuttlePointQuery {
  keyword: string
  status: ShuttlePointStatusFilter
}

export type ShuttlePointValidationField =
  | 'name'
  | 'code'
  | 'contactPhone'
  | 'routeName'
  | 'stations'
  | 'vehicles'
  | 'firstDeparture'
  | 'lastDeparture'
  | 'departureInterval'
  | 'remark'

export interface ShuttlePointValidationIssue {
  field: ShuttlePointValidationField
  code: 'required' | 'duplicate' | 'invalid' | 'positive_integer' | 'too_long'
  message: string
}

export interface ShuttlePointValidationResult {
  valid: boolean
  issues: readonly ShuttlePointValidationIssue[]
}
