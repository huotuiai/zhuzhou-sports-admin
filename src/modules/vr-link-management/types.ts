export type VrPlaceType = 'gate' | 'parking' | 'shuttle_stop'
export type VrPlaceTypeFilter = 'all' | VrPlaceType
export type VrLinkStatus = 'enabled' | 'disabled'
export type VrLinkStatusFilter = 'all' | VrLinkStatus

export interface VrLink {
  id: string
  title: string
  vrUrl: string
  placeType: VrPlaceType
  placeId: string
  status: VrLinkStatus
  remark: string
  placeName: string
  placeTypeLabel: string
  createdAt: string
  updatedAt: string
}

export interface VrPlaceOption {
  id: string
  name: string
  extra: string
  available: boolean
}

export interface VrLinkWriteInput {
  title: string
  vrUrl: string
  placeType: VrPlaceType
  placeId: string
  status: VrLinkStatus
  remark: string
}

export interface VrLinkQuery {
  keyword: string
  placeType: VrPlaceTypeFilter
  status: VrLinkStatusFilter
}

export interface VrLinkPage {
  records: VrLink[]
  total: number
  page: number
  pageSize: number
}

export interface VrLinkService {
  listPage(page: number, pageSize: number, query: VrLinkQuery): Promise<VrLinkPage>
  listPlaceOptions(placeType: VrPlaceType): Promise<VrPlaceOption[]>
  get(id: string): Promise<VrLink>
  create(input: VrLinkWriteInput): Promise<VrLink>
  update(id: string, input: VrLinkWriteInput): Promise<VrLink>
  updateStatus(id: string, status: VrLinkStatus): Promise<VrLink>
  remove(id: string): Promise<void>
}

export type VrLinkValidationField = keyof VrLinkWriteInput

export interface VrLinkValidationIssue {
  field: VrLinkValidationField
  code: 'required' | 'too_long' | 'invalid'
  message: string
}

export interface VrLinkValidationResult {
  valid: boolean
  issues: readonly VrLinkValidationIssue[]
}
