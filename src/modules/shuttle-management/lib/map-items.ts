import type { MapMarkerItem, MapRouteItem } from '@/components/map/types'
import type { ShuttleRoute } from '../types'

const SHUTTLE_ROUTE_PALETTE = ['#2563eb', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#16a34a', '#dc2626', '#0f766e']

export type ShuttleMapPhase = 'entry' | 'exit'

export interface ShuttleMapItems {
  markers: MapMarkerItem[]
  routes: MapRouteItem[]
  missingCount: number
  mappedCount: number
}

export function shuttleRouteColor(route: Pick<ShuttleRoute, 'code'>): string {
  let hash = 0
  for (const character of route.code) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return SHUTTLE_ROUTE_PALETTE[hash % SHUTTLE_ROUTE_PALETTE.length]!
}

export function createShuttleMapItems(records: readonly ShuttleRoute[], selectedId: string | null, phase: ShuttleMapPhase): ShuttleMapItems {
  const markers: MapMarkerItem[] = []
  const routes: MapRouteItem[] = []
  const phaseLabel = phase === 'entry' ? '入场' : '离场'
  let missingCount = 0

  for (const route of records) {
    const color = shuttleRouteColor(route)
    const points = []
    // 普通站点按入场顺序配置；继承站点已由服务端反序，避免离场时重复反转。
    const reverseOrder = (phase === 'exit') !== Boolean(route.stationsInherited)
    const stations = reverseOrder ? [...route.stations].reverse() : route.stations
    for (const [index, station] of stations.entries()) {
      const point = phase === 'entry' ? station.point : station.outboundPoint
      if (!point) {
        missingCount += 1
        continue
      }
      points.push({ ...point })
      markers.push({
        id: `${route.id}::${station.id}`,
        point: { ...point },
        label: `${index + 1}. ${station.name}`,
        description: `${route.code} · ${phaseLabel}`,
        color,
        selected: route.id === selectedId,
      })
    }
    if (points.length >= 2) routes.push({ id: route.id, label: `${route.name} · ${phaseLabel}`, points, color, selected: route.id === selectedId })
  }

  return { markers, routes, missingCount, mappedCount: markers.length }
}
