import type { ShuttleRoute, ShuttleStation } from '../types'
import { describe, expect, it } from 'vitest'
import { createShuttleMapItems, shuttleRouteColor } from './map-items'

function station(id: string, point: ShuttleStation['point']): ShuttleStation {
  return { id, name: `站点 ${id}`, point, navigationAddress: '', arrivalOffsetMinutes: null, arrivalGateIds: [] }
}

function route(stations: ShuttleStation[]): ShuttleRoute {
  return {
    id: 'route-1', code: 'L1', name: '测试线路', direction: 'inbound', description: '', firstDeparture: '08:00', lastDeparture: '22:00',
    departureIntervalMinutes: 10, durationMinutes: 40, operatingStatus: 'operating', realtimeStatusText: '', sortOrder: 1, enabled: true, stations,
    coordinateSystem: 'GCJ-02', createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
  }
}

describe('shuttle route map items', () => {
  it('keeps empty routes out of map layers', () => {
    expect(createShuttleMapItems([route([])], null)).toEqual({ markers: [], routes: [], missingCount: 0, mappedCount: 0 })
  })

  it('renders a single coordinate as a marker without a route', () => {
    const result = createShuttleMapItems([route([station('S1', { lng: 113.1, lat: 27.8 })])], null)
    expect(result.markers).toHaveLength(1)
    expect(result.routes).toHaveLength(0)
  })

  it('skips missing coordinates, connects remaining ordered points and marks selection', () => {
    const record = route([
      station('S1', { lng: 113.1, lat: 27.8 }),
      station('S2', null),
      station('S3', { lng: 113.2, lat: 27.9 }),
    ])
    const result = createShuttleMapItems([record], record.id)
    expect(result).toMatchObject({ missingCount: 1, mappedCount: 2 })
    expect(result.routes[0]?.points).toEqual([{ lng: 113.1, lat: 27.8 }, { lng: 113.2, lat: 27.9 }])
    expect(result.routes[0]?.selected).toBe(true)
    expect(result.markers.every((item) => item.selected)).toBe(true)
    expect(shuttleRouteColor(record)).toBe(shuttleRouteColor(record))
  })
})
