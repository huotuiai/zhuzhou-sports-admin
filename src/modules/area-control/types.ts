export type LngLatTuple = readonly [longitude: number, latitude: number]

export type ControlZoneGeometry =
  | {
      type: 'rectangle'
      southWest: LngLatTuple
      northEast: LngLatTuple
    }
  | {
      type: 'polygon'
      path: readonly LngLatTuple[]
    }

export interface ControlZone {
  id: string
  name: string
  description: string
  enabled: boolean
  coordinateSystem: 'GCJ-02'
  geometry: ControlZoneGeometry
  areaSquareMeters: number
  createdAt: string
  updatedAt: string
}

export interface ControlZoneWriteInput {
  name: string
  description: string
  enabled: boolean
  coordinateSystem: 'GCJ-02'
  geometry: ControlZoneGeometry
  areaSquareMeters: number
}

export interface ControlZoneService {
  list(): Promise<ControlZone[]>
  create(input: ControlZoneWriteInput): Promise<ControlZone>
  update(id: string, input: ControlZoneWriteInput): Promise<ControlZone>
  remove(id: string): Promise<void>
}

export type ControlZoneMode = 'list' | 'detail' | 'create' | 'edit'

export interface ControlZoneDraft {
  id?: string
  name: string
  description: string
  enabled: boolean
  geometry: ControlZoneGeometry | null
}

/** 地图与页面编排层之间的窄接口，不暴露高德实例。 */
export interface AreaControlMapHandle {
  startDrawing(type: ControlZoneGeometry['type']): boolean
  cancelDrawing(): void
  beginEditing(id: string): boolean
  finishEditing(emitFinalGeometry?: boolean): void
  restoreGeometry(id: string, geometry: ControlZoneGeometry): boolean
  focusZone(id: string): boolean
  focusZhuzhou(): void
  fitAll(): void
  retry(): Promise<void>
}

export interface ControlZoneDraftPatch {
  name?: string
  description?: string
  enabled?: boolean
  geometry?: ControlZoneGeometry | null
}

export interface ControlZoneValidationIssue {
  field: 'name' | 'description' | 'geometry' | 'boundary'
  code:
    | 'required'
    | 'duplicate'
    | 'too_long'
    | 'invalid_geometry'
    | 'boundary_unavailable'
    | 'outside_boundary'
  message: string
}

export interface ControlZoneDraftValidation {
  valid: boolean
  issues: readonly ControlZoneValidationIssue[]
}
