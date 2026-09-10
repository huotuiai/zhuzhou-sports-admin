import type { ShuttleRoute, ShuttleStation } from '../types'
import { describe, expect, it } from 'vitest'
import { createShuttleMapItems, shuttleRouteColor } from './map-items'

function station(id: string, point: ShuttleStation['point']): ShuttleStation {
  return { id, name: `站点 ${id}`, point, navigationAddress: '', arrivalGateIds: [] }
}

function route(stations: ShuttleStation[]): ShuttleRoute {
  return {
    id: 'route-1', code: 'L1', name: '测试线路', direction: 'inbound', description: '', firstDeparture: '08:00', lastDeparture: '22:00',
    departureIntervalMinutes: 10, durationMinutes: 40, operatingStatus: 'operating', sortOrder: 1, enabled: true, stations,
    coordinateSystem: 'GCJ-02', createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
  }
}

describe('shuttle route map items', () => {
  it('keeps empty routes out of map layers', () => {
    expect(createShuttleMapItems([route([])], null, 'entry')).toEqual({ markers: [], routes: [], missingCount: 0, mappedCount: 0 })
  })

  it('renders a single coordinate as a marker without a route', () => {
    const result = createShuttleMapItems([route([station('S1', { lng: 113.1, lat: 27.8 })])], null, 'entry')
    expect(result.markers).toHaveLength(1)
    expect(result.routes).toHaveLength(0)
  })

  it.each(['inbound', 'outbound'] as const)('renders both coordinate sets independently of the legacy %s line direction', (direction) => {
    const record = route([
      { ...station('S1', { lng: 113.1, lat: 27.8 }), outboundPoint: { lng: 113.3, lat: 28 } },
      { ...station('S2', { lng: 113.2, lat: 27.9 }), outboundPoint: { lng: 113.4, lat: 28.1 } },
    ])
    record.direction = direction
    const entry = createShuttleMapItems([record], null, 'entry')
    const exit = createShuttleMapItems([record], record.id, 'exit')

    expect(entry.routes[0]?.points).toEqual([{ lng: 113.1, lat: 27.8 }, { lng: 113.2, lat: 27.9 }])
    expect(entry.markers.map(item => item.label)).toEqual(['1. 站点 S1', '2. 站点 S2'])
    expect(exit.routes[0]?.points).toEqual([{ lng: 113.4, lat: 28.1 }, { lng: 113.3, lat: 28 }])
    expect(exit.markers.map(item => item.label)).toEqual(['1. 站点 S2', '2. 站点 S1'])
    expect(exit.markers.every(item => item.description === 'L1 · 离场' && item.selected)).toBe(true)
    expect(exit.routes[0]).toMatchObject({ id: record.id, label: '测试线路 · 离场', selected: true, color: shuttleRouteColor(record) })
    expect(record.stations.map(item => item.id)).toEqual(['S1', 'S2'])
  })

  it('restores entry order for inherited stops and does not reverse their exit order twice', () => {
    const record = route([
      { ...station('S2', { lng: 113.2, lat: 27.9 }), outboundPoint: { lng: 113.4, lat: 28.1 } },
      { ...station('S1', { lng: 113.1, lat: 27.8 }), outboundPoint: { lng: 113.3, lat: 28 } },
    ])
    record.stationsInherited = true

    expect(createShuttleMapItems([record], null, 'entry').routes[0]?.points)
      .toEqual([{ lng: 113.1, lat: 27.8 }, { lng: 113.2, lat: 27.9 }])
    expect(createShuttleMapItems([record], null, 'exit').routes[0]?.points)
      .toEqual([{ lng: 113.4, lat: 28.1 }, { lng: 113.3, lat: 28 }])
    expect(record.stations.map(item => item.id)).toEqual(['S2', 'S1'])
  })

  it('skips missing coordinates, connects remaining ordered points and marks selection', () => {
    const record = route([
      station('S1', { lng: 113.1, lat: 27.8 }),
      station('S2', null),
      station('S3', { lng: 113.2, lat: 27.9 }),
    ])
    const result = createShuttleMapItems([record], record.id, 'entry')
    expect(result).toMatchObject({ missingCount: 1, mappedCount: 2 })
    expect(result.routes[0]?.points).toEqual([{ lng: 113.1, lat: 27.8 }, { lng: 113.2, lat: 27.9 }])
    expect(result.routes[0]?.selected).toBe(true)
    expect(result.markers.every((item) => item.selected)).toBe(true)
    expect(shuttleRouteColor(record)).toBe(shuttleRouteColor(record))
  })

  it('counts missing coordinates separately and never substitutes entry coordinates for exit coordinates', () => {
    const record = route([
      station('S1', { lng: 113.1, lat: 27.8 }),
      { ...station('S2', null), outboundPoint: { lng: 113.4, lat: 28.1 } },
      { ...station('S3', { lng: 0, lat: 0 }), outboundPoint: null },
    ])
    const entry = createShuttleMapItems([record], null, 'entry')
    const exit = createShuttleMapItems([record], null, 'exit')

    expect(entry).toMatchObject({ missingCount: 1, mappedCount: 2 })
    expect(entry.routes[0]?.points).toEqual([{ lng: 113.1, lat: 27.8 }, { lng: 0, lat: 0 }])
    expect(exit).toMatchObject({ missingCount: 2, mappedCount: 1, routes: [] })
    expect(exit.markers[0]).toMatchObject({ point: { lng: 113.4, lat: 28.1 }, label: '2. 站点 S2' })
  })
})
