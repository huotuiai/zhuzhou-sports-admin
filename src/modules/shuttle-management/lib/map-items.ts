import type { MapMarkerItem, MapRouteItem } from '@/components/map/types'
import type { ShuttleRoute } from '../types'

const SHUTTLE_ROUTE_PALETTE = ['#2563eb', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#16a34a', '#dc2626', '#0f766e']

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

export function createShuttleMapItems(records: readonly ShuttleRoute[], selectedId: string | null): ShuttleMapItems {
  const markers: MapMarkerItem[] = []
  const routes: MapRouteItem[] = []
  let missingCount = 0

  for (const route of records) {
    const color = shuttleRouteColor(route)
    const points = []
    for (const [index, station] of route.stations.entries()) {
      if (!station.point) {
        missingCount += 1
        continue
      }
      points.push({ ...station.point })
      markers.push({
        id: `${route.id}::${station.id}`,
        point: { ...station.point },
        label: `${index + 1}. ${station.name}`,
        description: route.code,
        color,
        selected: route.id === selectedId,
      })
    }
    if (points.length >= 2) routes.push({ id: route.id, label: route.name, points, color, selected: route.id === selectedId })
  }

  return { markers, routes, missingCount, mappedCount: markers.length }
}
