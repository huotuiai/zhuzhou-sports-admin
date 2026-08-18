export interface GeoPoint {
  lng: number
  lat: number
}

export type MapGeometry =
  | { type: 'polygon', path: GeoPoint[] }
  | { type: 'rectangle', southWest: GeoPoint, northEast: GeoPoint }
  | { type: 'circle', center: GeoPoint, radiusMeters: number }

export interface MapAreaItem {
  id: string
  geometry: MapGeometry
  label: string
  color: string
  selected?: boolean
}

export interface MapMarkerItem {
  id: string
  point: GeoPoint
  label: string
  description?: string
  color?: string
  selected?: boolean
}

export interface MapRouteItem {
  id: string
  label: string
  points: GeoPoint[]
  color: string
  selected?: boolean
}

export type MapTheme = 'dark' | 'light'
