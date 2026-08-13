import { describe, expect, it } from 'vitest'
import {
  calculateGeometryAreaSquareMeters,
  deduplicateVertices,
  geometriesOverlapOrTouch,
  hasSelfIntersection,
  isGeometryInsideBoundary,
  normalizeGeometry,
  pointOnBoundary,
  validateGeometry,
} from './geometry'
import type { ControlZoneGeometry, LngLatTuple } from '../types'

const boundary: readonly LngLatTuple[] = [
  [112, 26],
  [114, 26],
  [114, 28],
  [112, 28],
]

function rectangle(
  west: number,
  south: number,
  east: number,
  north: number,
): ControlZoneGeometry {
  return { type: 'rectangle', southWest: [west, south], northEast: [east, north] }
}

describe('geometry utilities', () => {
  it('normalizes rectangles and removes duplicate polygon vertices', () => {
    expect(normalizeGeometry(rectangle(113.5, 27.5, 113, 27))).toEqual(
      rectangle(113, 27, 113.5, 27.5),
    )
    expect(
      deduplicateVertices([
        [113, 27],
        [113.5, 27],
        [113.5, 27],
        [113, 27],
      ]),
    ).toEqual([
      [113, 27],
      [113.5, 27],
    ])
  })

  it('calculates a positive area in square metres', () => {
    const area = calculateGeometryAreaSquareMeters(rectangle(113, 27, 113.01, 27.01))
    expect(area).toBeGreaterThan(1_000_000)
    expect(area).toBeLessThan(1_500_000)
  })

  it('rejects degenerate and self-intersecting geometry', () => {
    expect(validateGeometry(rectangle(113, 27, 113, 27.1)).valid).toBe(false)
    const bowTie: ControlZoneGeometry = {
      type: 'polygon',
      path: [
        [113, 27],
        [113.2, 27.2],
        [113, 27.2],
        [113.2, 27],
      ],
    }
    expect(hasSelfIntersection(bowTie.path)).toBe(true)
    expect(validateGeometry(bowTie)).toEqual({ valid: false, reason: '多边形不能自相交' })
  })

  it('distinguishes strict containment from touching the boundary', () => {
    expect(isGeometryInsideBoundary(rectangle(113, 27, 113.2, 27.2), [boundary])).toBe(true)
    expect(isGeometryInsideBoundary(rectangle(112, 27, 113.2, 27.2), [boundary])).toBe(false)
    expect(isGeometryInsideBoundary(rectangle(111.9, 27, 113.2, 27.2), [boundary])).toBe(false)
    expect(pointOnBoundary([112, 27], boundary)).toBe(true)
  })

  it('accepts containment within any one administrative boundary ring', () => {
    const secondBoundary: readonly LngLatTuple[] = [
      [115, 26],
      [116, 26],
      [116, 27],
      [115, 27],
    ]
    expect(isGeometryInsideBoundary(rectangle(115.2, 26.2, 115.4, 26.4), [boundary, secondBoundary])).toBe(
      true,
    )
  })

  it('reports crossing, touching, and containment as an overlap relation', () => {
    expect(
      geometriesOverlapOrTouch(rectangle(113, 27, 113.4, 27.4), rectangle(113.2, 27.2, 113.6, 27.6)),
    ).toBe(true)
    expect(
      geometriesOverlapOrTouch(rectangle(113, 27, 113.2, 27.2), rectangle(113.2, 27, 113.4, 27.2)),
    ).toBe(true)
    expect(
      geometriesOverlapOrTouch(rectangle(113, 27, 113.8, 27.8), rectangle(113.2, 27.2, 113.4, 27.4)),
    ).toBe(true)
    expect(
      geometriesOverlapOrTouch(rectangle(113, 27, 113.2, 27.2), rectangle(113.4, 27.4, 113.6, 27.6)),
    ).toBe(false)
  })
})
