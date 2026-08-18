import { describe, expect, it } from 'vitest'
import {
  calculateGeometryAreaSquareMeters,
  geometryToPolygonPath,
  hasSelfIntersection,
  parseCoordinateInput,
  parseGeoPointInput,
  serializeGeoPoint,
  serializePolygonCoordinates,
  validateGeometry,
} from './geometry'
import type { MapGeometry } from './types'

describe('shared map geometry', () => {
  it('calculates polygon, rectangle and circle areas', () => {
    const polygon: MapGeometry = { type: 'polygon', path: [{ lng: 113, lat: 27 }, { lng: 113.01, lat: 27 }, { lng: 113.01, lat: 27.01 }] }
    const rectangle: MapGeometry = { type: 'rectangle', southWest: { lng: 113, lat: 27 }, northEast: { lng: 113.01, lat: 27.01 } }
    const circle: MapGeometry = { type: 'circle', center: { lng: 113, lat: 27 }, radiusMeters: 100 }
    expect(calculateGeometryAreaSquareMeters(polygon)).toBeGreaterThan(500_000)
    expect(calculateGeometryAreaSquareMeters(rectangle)).toBeGreaterThan(1_000_000)
    expect(calculateGeometryAreaSquareMeters(circle)).toBeCloseTo(Math.PI * 10_000)
    expect(geometryToPolygonPath(circle)).toHaveLength(48)
  })

  it('rejects degenerate, self-intersecting and invalid circle geometry', () => {
    const bowTie: MapGeometry = { type: 'polygon', path: [
      { lng: 113, lat: 27 }, { lng: 113.2, lat: 27.2 }, { lng: 113, lat: 27.2 }, { lng: 113.2, lat: 27 },
    ] }
    expect(hasSelfIntersection(bowTie.path)).toBe(true)
    expect(validateGeometry(bowTie).valid).toBe(false)
    expect(validateGeometry({ type: 'circle', center: { lng: 113, lat: 27 }, radiusMeters: 0 }).valid).toBe(false)
  })

  it('parses all supported coordinate formats and serializes canonical JSON', () => {
    const sources = [
      '[[113,27],[113.1,27],[113.1,27.1]]',
      '[{"lng":113,"lat":27},{"lng":113.1,"lat":27},{"lng":113.1,"lat":27.1}]',
      '113,27; 113.1,27; 113.1,27.1',
    ]
    for (const source of sources) {
      const geometry = parseCoordinateInput(source)
      expect(geometry.type).toBe('polygon')
      expect(JSON.parse(serializePolygonCoordinates(geometry))).toHaveLength(3)
    }
    expect(() => parseCoordinateInput('113,27; bad')).toThrow()
  })

  it('parses and serializes a single optional-form coordinate value', () => {
    expect(parseGeoPointInput('113.1462, 27.8165')).toEqual({ lng: 113.1462, lat: 27.8165 })
    expect(parseGeoPointInput('[113.1462,27.8165]')).toEqual({ lng: 113.1462, lat: 27.8165 })
    expect(parseGeoPointInput('{"lng":113.1462,"lat":27.8165}')).toEqual({ lng: 113.1462, lat: 27.8165 })
    expect(serializeGeoPoint({ lng: 113.1462, lat: 27.8165 })).toBe('113.1462,27.8165')
    expect(() => parseGeoPointInput('')).toThrow('请输入经纬度')
    expect(() => parseGeoPointInput('181,27')).toThrow('请输入合法')
    expect(() => parseGeoPointInput('113')).toThrow('请输入合法')
  })
})
