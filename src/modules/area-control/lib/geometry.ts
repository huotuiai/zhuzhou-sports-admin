import type { ControlZoneGeometry, LngLatTuple } from '../types'

export type BoundaryRings = readonly (readonly LngLatTuple[])[]

export interface GeometryValidationResult {
  valid: boolean
  reason: string | null
}

const EARTH_RADIUS_METERS = 6_371_008.8
const EPSILON = 1e-10

function samePoint(a: LngLatTuple, b: LngLatTuple): boolean {
  return Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON
}

function isFiniteCoordinate(point: LngLatTuple): boolean {
  return (
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    point[0] >= -180 &&
    point[0] <= 180 &&
    point[1] >= -90 &&
    point[1] <= 90
  )
}

export function deduplicateVertices(path: readonly LngLatTuple[]): LngLatTuple[] {
  const result: LngLatTuple[] = []

  for (const point of path) {
    const copy: LngLatTuple = [point[0], point[1]]
    if (!result.some((existing) => samePoint(existing, copy))) result.push(copy)
  }

  if (result.length > 1 && samePoint(result[0]!, result[result.length - 1]!)) {
    result.pop()
  }

  return result
}

export function rectangleToPath(geometry: Extract<ControlZoneGeometry, { type: 'rectangle' }>): LngLatTuple[] {
  const west = Math.min(geometry.southWest[0], geometry.northEast[0])
  const east = Math.max(geometry.southWest[0], geometry.northEast[0])
  const south = Math.min(geometry.southWest[1], geometry.northEast[1])
  const north = Math.max(geometry.southWest[1], geometry.northEast[1])

  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ]
}

export function geometryToPath(geometry: ControlZoneGeometry): LngLatTuple[] {
  return geometry.type === 'rectangle'
    ? rectangleToPath(geometry)
    : geometry.path.map((point) => [point[0], point[1]])
}

export function normalizeGeometry(geometry: ControlZoneGeometry): ControlZoneGeometry {
  if (geometry.type === 'polygon') {
    return { type: 'polygon', path: deduplicateVertices(geometry.path) }
  }

  const [firstLng, firstLat] = geometry.southWest
  const [secondLng, secondLat] = geometry.northEast
  return {
    type: 'rectangle',
    southWest: [Math.min(firstLng, secondLng), Math.min(firstLat, secondLat)],
    northEast: [Math.max(firstLng, secondLng), Math.max(firstLat, secondLat)],
  }
}

export function cloneGeometry(geometry: ControlZoneGeometry): ControlZoneGeometry {
  return normalizeGeometry(geometry)
}

function signedRingArea(path: readonly LngLatTuple[]): number {
  if (path.length < 3) return 0

  const latitudeOrigin = path.reduce((sum, point) => sum + point[1], 0) / path.length
  const cosLatitude = Math.cos((latitudeOrigin * Math.PI) / 180)
  const projected = path.map(([longitude, latitude]) => {
    const longitudeRadians = (longitude * Math.PI) / 180
    const latitudeRadians = (latitude * Math.PI) / 180
    return [
      EARTH_RADIUS_METERS * longitudeRadians * cosLatitude,
      EARTH_RADIUS_METERS * latitudeRadians,
    ] as const
  })

  let twiceArea = 0
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index]!
    const next = projected[(index + 1) % projected.length]!
    twiceArea += current[0] * next[1] - next[0] * current[1]
  }
  return twiceArea / 2
}

/** Returns an equirectangular local projection approximation in square metres. */
export function calculatePathAreaSquareMeters(path: readonly LngLatTuple[]): number {
  return Math.abs(signedRingArea(deduplicateVertices(path)))
}

export function calculateGeometryAreaSquareMeters(geometry: ControlZoneGeometry): number {
  return calculatePathAreaSquareMeters(geometryToPath(normalizeGeometry(geometry)))
}

function cross(a: LngLatTuple, b: LngLatTuple, c: LngLatTuple): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

export function pointOnSegment(point: LngLatTuple, start: LngLatTuple, end: LngLatTuple): boolean {
  if (Math.abs(cross(start, end, point)) > EPSILON) return false
  return (
    point[0] >= Math.min(start[0], end[0]) - EPSILON &&
    point[0] <= Math.max(start[0], end[0]) + EPSILON &&
    point[1] >= Math.min(start[1], end[1]) - EPSILON &&
    point[1] <= Math.max(start[1], end[1]) + EPSILON
  )
}

export function pointOnBoundary(point: LngLatTuple, ring: readonly LngLatTuple[]): boolean {
  for (let index = 0; index < ring.length; index += 1) {
    if (pointOnSegment(point, ring[index]!, ring[(index + 1) % ring.length]!)) return true
  }
  return false
}

export function pointInRing(point: LngLatTuple, ring: readonly LngLatTuple[], includeBoundary = false): boolean {
  if (ring.length < 3) return false
  if (pointOnBoundary(point, ring)) return includeBoundary

  let inside = false
  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex++) {
    const current = ring[currentIndex]!
    const previous = ring[previousIndex]!
    const crossesRay = current[1] > point[1] !== previous[1] > point[1]
    if (!crossesRay) continue

    const longitudeAtLatitude =
      ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) + current[0]
    if (point[0] < longitudeAtLatitude) inside = !inside
  }
  return inside
}

function segmentsIntersectOrTouch(
  firstStart: LngLatTuple,
  firstEnd: LngLatTuple,
  secondStart: LngLatTuple,
  secondEnd: LngLatTuple,
): boolean {
  const firstA = cross(firstStart, firstEnd, secondStart)
  const firstB = cross(firstStart, firstEnd, secondEnd)
  const secondA = cross(secondStart, secondEnd, firstStart)
  const secondB = cross(secondStart, secondEnd, firstEnd)

  if (
    ((firstA > EPSILON && firstB < -EPSILON) || (firstA < -EPSILON && firstB > EPSILON)) &&
    ((secondA > EPSILON && secondB < -EPSILON) || (secondA < -EPSILON && secondB > EPSILON))
  ) {
    return true
  }

  return (
    pointOnSegment(secondStart, firstStart, firstEnd) ||
    pointOnSegment(secondEnd, firstStart, firstEnd) ||
    pointOnSegment(firstStart, secondStart, secondEnd) ||
    pointOnSegment(firstEnd, secondStart, secondEnd)
  )
}

export function hasSelfIntersection(path: readonly LngLatTuple[]): boolean {
  const points = deduplicateVertices(path)
  if (points.length < 4) return false

  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length
      const adjacent = first === second || firstNext === second || secondNext === first
      if (adjacent) continue
      if (segmentsIntersectOrTouch(points[first]!, points[firstNext]!, points[second]!, points[secondNext]!)) {
        return true
      }
    }
  }
  return false
}

export function validateGeometry(geometry: ControlZoneGeometry): GeometryValidationResult {
  const normalized = normalizeGeometry(geometry)
  const path = geometryToPath(normalized)
  if (path.some((point) => !isFiniteCoordinate(point))) {
    return { valid: false, reason: '区域包含无效坐标' }
  }
  if (normalized.type === 'polygon' && path.length < 3) {
    return { valid: false, reason: '多边形至少需要 3 个不同顶点' }
  }
  if (normalized.type === 'polygon' && hasSelfIntersection(path)) {
    return { valid: false, reason: '多边形不能自相交' }
  }
  if (calculatePathAreaSquareMeters(path) <= 0.01) {
    return { valid: false, reason: '区域面积必须大于零' }
  }
  return { valid: true, reason: null }
}

function ringsHaveIntersectingEdges(first: readonly LngLatTuple[], second: readonly LngLatTuple[]): boolean {
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      if (
        segmentsIntersectOrTouch(
          first[firstIndex]!,
          first[(firstIndex + 1) % first.length]!,
          second[secondIndex]!,
          second[(secondIndex + 1) % second.length]!,
        )
      ) {
        return true
      }
    }
  }
  return false
}

export function isGeometryInsideBoundary(geometry: ControlZoneGeometry, boundaries: BoundaryRings): boolean {
  const candidate = geometryToPath(normalizeGeometry(geometry))
  if (!validateGeometry(geometry).valid || boundaries.length === 0) return false

  return boundaries.some((boundaryInput) => {
    const boundary = deduplicateVertices(boundaryInput)
    if (boundary.length < 3) return false
    if (!candidate.every((point) => pointInRing(point, boundary, false))) return false
    return !ringsHaveIntersectingEdges(candidate, boundary)
  })
}

export function geometriesOverlapOrTouch(first: ControlZoneGeometry, second: ControlZoneGeometry): boolean {
  const firstPath = geometryToPath(normalizeGeometry(first))
  const secondPath = geometryToPath(normalizeGeometry(second))
  if (!validateGeometry(first).valid || !validateGeometry(second).valid) return false
  if (ringsHaveIntersectingEdges(firstPath, secondPath)) return true
  return pointInRing(firstPath[0]!, secondPath, true) || pointInRing(secondPath[0]!, firstPath, true)
}

export const isGeometryWithinAnyBoundary = isGeometryInsideBoundary
export const doGeometriesOverlapOrTouch = geometriesOverlapOrTouch
