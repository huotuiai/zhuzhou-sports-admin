import type { GeoPoint, MapGeometry } from './types'

export interface GeometryValidationResult {
  valid: boolean
  reason: string | null
}

const EARTH_RADIUS_METERS = 6_371_008.8
const EPSILON = 1e-10

function samePoint(first: GeoPoint, second: GeoPoint): boolean {
  return Math.abs(first.lng - second.lng) <= EPSILON && Math.abs(first.lat - second.lat) <= EPSILON
}

export function isValidGeoPoint(point: GeoPoint): boolean {
  return Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180 &&
    Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
}

export function clonePoint(point: GeoPoint): GeoPoint {
  return { lng: point.lng, lat: point.lat }
}

export function deduplicatePoints(path: readonly GeoPoint[]): GeoPoint[] {
  const result: GeoPoint[] = []
  for (const point of path) {
    if (!result.some((candidate) => samePoint(candidate, point))) result.push(clonePoint(point))
  }
  if (result.length > 1 && samePoint(result[0]!, result[result.length - 1]!)) result.pop()
  return result
}

export function normalizeGeometry(geometry: MapGeometry): MapGeometry {
  if (geometry.type === 'polygon') {
    return { type: 'polygon', path: deduplicatePoints(geometry.path) }
  }
  if (geometry.type === 'circle') {
    return {
      type: 'circle',
      center: clonePoint(geometry.center),
      radiusMeters: geometry.radiusMeters,
    }
  }
  return {
    type: 'rectangle',
    southWest: {
      lng: Math.min(geometry.southWest.lng, geometry.northEast.lng),
      lat: Math.min(geometry.southWest.lat, geometry.northEast.lat),
    },
    northEast: {
      lng: Math.max(geometry.southWest.lng, geometry.northEast.lng),
      lat: Math.max(geometry.southWest.lat, geometry.northEast.lat),
    },
  }
}

export function cloneGeometry(geometry: MapGeometry): MapGeometry {
  return normalizeGeometry(geometry)
}

export function geometryToPolygonPath(geometryInput: MapGeometry, circleSegments = 48): GeoPoint[] {
  const geometry = normalizeGeometry(geometryInput)
  if (geometry.type === 'polygon') return geometry.path.map(clonePoint)
  if (geometry.type === 'rectangle') {
    return [
      clonePoint(geometry.southWest),
      { lng: geometry.northEast.lng, lat: geometry.southWest.lat },
      clonePoint(geometry.northEast),
      { lng: geometry.southWest.lng, lat: geometry.northEast.lat },
    ]
  }

  const latitudeRadians = geometry.center.lat * Math.PI / 180
  const latitudeDelta = geometry.radiusMeters / EARTH_RADIUS_METERS * 180 / Math.PI
  const longitudeDelta = latitudeDelta / Math.max(Math.cos(latitudeRadians), EPSILON)
  return Array.from({ length: Math.max(12, circleSegments) }, (_, index) => {
    const angle = index / Math.max(12, circleSegments) * Math.PI * 2
    return {
      lng: geometry.center.lng + Math.cos(angle) * longitudeDelta,
      lat: geometry.center.lat + Math.sin(angle) * latitudeDelta,
    }
  })
}

function signedRingArea(path: readonly GeoPoint[]): number {
  if (path.length < 3) return 0
  const latitudeOrigin = path.reduce((sum, point) => sum + point.lat, 0) / path.length
  const cosLatitude = Math.cos(latitudeOrigin * Math.PI / 180)
  const projected = path.map((point) => [
    EARTH_RADIUS_METERS * point.lng * Math.PI / 180 * cosLatitude,
    EARTH_RADIUS_METERS * point.lat * Math.PI / 180,
  ] as const)
  let twiceArea = 0
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index]!
    const next = projected[(index + 1) % projected.length]!
    twiceArea += current[0] * next[1] - next[0] * current[1]
  }
  return twiceArea / 2
}

export function calculateGeometryAreaSquareMeters(geometry: MapGeometry): number {
  if (geometry.type === 'circle') return Math.PI * geometry.radiusMeters ** 2
  return Math.abs(signedRingArea(geometryToPolygonPath(geometry)))
}

function cross(first: GeoPoint, second: GeoPoint, third: GeoPoint): number {
  return (second.lng - first.lng) * (third.lat - first.lat) -
    (second.lat - first.lat) * (third.lng - first.lng)
}

function pointOnSegment(point: GeoPoint, start: GeoPoint, end: GeoPoint): boolean {
  if (Math.abs(cross(start, end, point)) > EPSILON) return false
  return point.lng >= Math.min(start.lng, end.lng) - EPSILON &&
    point.lng <= Math.max(start.lng, end.lng) + EPSILON &&
    point.lat >= Math.min(start.lat, end.lat) - EPSILON &&
    point.lat <= Math.max(start.lat, end.lat) + EPSILON
}

function segmentsIntersectOrTouch(
  firstStart: GeoPoint,
  firstEnd: GeoPoint,
  secondStart: GeoPoint,
  secondEnd: GeoPoint,
): boolean {
  const firstA = cross(firstStart, firstEnd, secondStart)
  const firstB = cross(firstStart, firstEnd, secondEnd)
  const secondA = cross(secondStart, secondEnd, firstStart)
  const secondB = cross(secondStart, secondEnd, firstEnd)
  if (
    ((firstA > EPSILON && firstB < -EPSILON) || (firstA < -EPSILON && firstB > EPSILON)) &&
    ((secondA > EPSILON && secondB < -EPSILON) || (secondA < -EPSILON && secondB > EPSILON))
  ) return true
  return pointOnSegment(secondStart, firstStart, firstEnd) ||
    pointOnSegment(secondEnd, firstStart, firstEnd) ||
    pointOnSegment(firstStart, secondStart, secondEnd) ||
    pointOnSegment(firstEnd, secondStart, secondEnd)
}

export function hasSelfIntersection(pathInput: readonly GeoPoint[]): boolean {
  const path = deduplicatePoints(pathInput)
  if (path.length < 4) return false
  for (let first = 0; first < path.length; first += 1) {
    const firstNext = (first + 1) % path.length
    for (let second = first + 1; second < path.length; second += 1) {
      const secondNext = (second + 1) % path.length
      if (first === second || firstNext === second || secondNext === first) continue
      if (segmentsIntersectOrTouch(path[first]!, path[firstNext]!, path[second]!, path[secondNext]!)) return true
    }
  }
  return false
}

export function validateGeometry(geometryInput: MapGeometry): GeometryValidationResult {
  const geometry = normalizeGeometry(geometryInput)
  if (geometry.type === 'circle') {
    if (!isValidGeoPoint(geometry.center)) return { valid: false, reason: '圆心包含无效坐标' }
    if (!Number.isFinite(geometry.radiusMeters) || geometry.radiusMeters <= 0) {
      return { valid: false, reason: '圆形半径必须大于零' }
    }
    return { valid: true, reason: null }
  }

  const path = geometryToPolygonPath(geometry)
  if (path.some((point) => !isValidGeoPoint(point))) return { valid: false, reason: '区域包含无效坐标' }
  if (geometry.type === 'polygon' && path.length < 3) {
    return { valid: false, reason: '多边形至少需要 3 个不同顶点' }
  }
  if (geometry.type === 'polygon' && hasSelfIntersection(path)) {
    return { valid: false, reason: '多边形不能自相交' }
  }
  if (calculateGeometryAreaSquareMeters(geometry) <= 0.01) {
    return { valid: false, reason: '区域面积必须大于零' }
  }
  return { valid: true, reason: null }
}

export function geometryCenter(geometryInput: MapGeometry): GeoPoint {
  const geometry = normalizeGeometry(geometryInput)
  if (geometry.type === 'circle') return clonePoint(geometry.center)
  if (geometry.type === 'rectangle') {
    return {
      lng: (geometry.southWest.lng + geometry.northEast.lng) / 2,
      lat: (geometry.southWest.lat + geometry.northEast.lat) / 2,
    }
  }
  if (geometry.path.length === 0) return { lng: 113.1106, lat: 27.841 }
  return {
    lng: geometry.path.reduce((sum, point) => sum + point.lng, 0) / geometry.path.length,
    lat: geometry.path.reduce((sum, point) => sum + point.lat, 0) / geometry.path.length,
  }
}

function pointFromUnknown(value: unknown): GeoPoint | null {
  if (Array.isArray(value) && value.length === 2) {
    const point = { lng: Number(value[0]), lat: Number(value[1]) }
    return isValidGeoPoint(point) ? point : null
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const point = { lng: Number(record.lng), lat: Number(record.lat) }
    return isValidGeoPoint(point) ? point : null
  }
  return null
}

export function parseGeoPointInput(value: string): GeoPoint {
  const source = value.trim()
  if (!source) throw new Error('请输入经纬度')

  let point: GeoPoint | null = null
  if (source.startsWith('[') || source.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(source)
    }
    catch {
      throw new Error('经纬度 JSON 格式不正确')
    }
    point = pointFromUnknown(parsed)
  }
  else {
    const parts = source.split(',').map((part) => part.trim())
    if (parts.length === 2 && parts.every(Boolean)) {
      point = pointFromUnknown(parts)
    }
  }

  if (!point) throw new Error('请输入合法的经度,纬度')
  return clonePoint(point)
}

export function serializeGeoPoint(point: GeoPoint): string {
  if (!isValidGeoPoint(point)) throw new Error('经纬度无效')
  return `${point.lng},${point.lat}`
}

export function parseCoordinateInput(value: string): MapGeometry {
  const source = value.trim()
  if (!source) throw new Error('请输入坐标')

  let points: GeoPoint[]
  if (source.startsWith('[')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(source)
    }
    catch {
      throw new Error('坐标 JSON 格式不正确')
    }
    if (!Array.isArray(parsed)) throw new Error('坐标必须是数组')
    points = parsed.map((item) => pointFromUnknown(item) ?? { lng: Number.NaN, lat: Number.NaN })
  }
  else {
    points = source.split(';').map((segment) => {
      const parts = segment.split(',').map((part) => part.trim())
      return { lng: Number(parts[0]), lat: Number(parts[1]) }
    })
  }

  const geometry: MapGeometry = { type: 'polygon', path: points }
  const validation = validateGeometry(geometry)
  if (!validation.valid) throw new Error(validation.reason ?? '坐标无效')
  return normalizeGeometry(geometry)
}

export function serializePolygonCoordinates(geometry: MapGeometry): string {
  return JSON.stringify(geometryToPolygonPath(geometry).map(({ lng, lat }) => ({ lng, lat })))
}
