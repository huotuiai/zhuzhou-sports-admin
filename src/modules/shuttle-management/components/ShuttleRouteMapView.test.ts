// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- The map layer stubs are local to this component test. */
import type { App, PropType } from 'vue'
import type { MapMarkerItem, MapRouteItem } from '@/components/map/types'
import type { ShuttleRoute } from '../types'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShuttleRouteMapView from './ShuttleRouteMapView.vue'

vi.mock('@/components/map', () => ({
  AMapCanvas: defineComponent({
    setup: (_, { slots }) => () => h('div', slots.default?.()),
  }),
  AMapMarkerLayer: defineComponent({
    props: { markers: { type: Array as PropType<MapMarkerItem[]>, required: true } },
    emits: ['select'],
    setup: (props, { emit }) => () => h('div', props.markers.map(item => h('button', {
      'data-marker': item.id,
      'data-point': `${item.point.lng},${item.point.lat}`,
      onClick: () => emit('select', item.id),
    }, `${item.label} · ${item.description}`))),
  }),
  AMapRouteLayer: defineComponent({
    props: { routes: { type: Array as PropType<MapRouteItem[]>, required: true } },
    emits: ['select'],
    setup: (props, { emit }) => () => h('div', props.routes.map(item => h('button', {
      'data-route': item.id,
      onClick: () => emit('select', item.id),
    }, item.label))),
  }),
}))

const mounted: Array<{ app: App, host: HTMLDivElement }> = []

function mountMap(direction: ShuttleRoute['direction'] = 'outbound') {
  const records = shallowRef<ShuttleRoute[]>([{
    id: 'route-1', code: 'L1', name: '测试线路', direction, description: '',
    firstDeparture: '08:00', lastDeparture: '22:00', departureIntervalMinutes: 10, durationMinutes: 40,
    operatingStatus: 'operating', sortOrder: 1, enabled: true, coordinateSystem: 'GCJ-02',
    createdAt: '2026-09-10', updatedAt: '2026-09-10',
    stations: [
      { id: 'S1', name: '起点站', point: { lng: 113.1, lat: 27.8 }, outboundPoint: { lng: 113.3, lat: 28 }, navigationAddress: '', arrivalGateIds: [] },
      { id: 'S2', name: '终点站', point: { lng: 113.2, lat: 27.9 }, outboundPoint: { lng: 113.4, lat: 28.1 }, navigationAddress: '', arrivalGateIds: [] },
    ],
  }])
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ setup: () => () => h(ShuttleRouteMapView, { records: records.value }) })
  app.mount(host)
  mounted.push({ app, host })
  return {
    host, records,
    async click(text: string) {
      const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === text)
      if (!button) throw new Error(`Button not found: ${text}`)
      button.click()
      await nextTick()
    },
    coordinates: () => [...host.querySelectorAll('[data-marker]')].map(item => item.getAttribute('data-point')),
  }
}

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
})

describe('shuttle map station locations', () => {
  it.each(['inbound', 'outbound'] as const)('switches map coordinates and selected details independently of legacy %s direction', async (direction) => {
    const fixture = mountMap(direction)
    expect(fixture.coordinates()).toEqual(['113.1,27.8', '113.2,27.9'])
    expect(fixture.host.textContent).not.toMatch(/（进场）|（出场）/)

    await fixture.click('测试线路 · 入场')
    expect(fixture.host.textContent).toContain('入场定位 · 2 个站点')
    await fixture.click('离场定位')
    expect(fixture.coordinates()).toEqual(['113.4,28.1', '113.3,28'])
    expect(fixture.host.textContent).toContain('离场定位 · 2 个站点')
    expect(fixture.host.querySelector('[role="group"] [aria-pressed="true"]')?.textContent).toBe('离场定位')

    await fixture.click('入场定位')
    expect(fixture.coordinates()).toEqual(['113.1,27.8', '113.2,27.9'])
    expect(fixture.host.textContent).toContain('入场定位 · 2 个站点')
  })

  it('shows phase-specific missing coordinates and clears selection when records disappear', async () => {
    const fixture = mountMap()
    await fixture.click('1. 起点站 · L1 · 入场')
    expect(fixture.host.textContent).toContain('入场定位 · 2 个站点')
    fixture.records.value = fixture.records.value.map(record => ({
      ...record,
      stations: record.stations.map(station => ({ ...station, outboundPoint: null })),
    }))
    await nextTick()
    expect(fixture.host.textContent).not.toContain('未配置入场坐标')

    await fixture.click('离场定位')
    expect(fixture.coordinates()).toEqual([])
    expect(fixture.host.textContent).toContain('2 个站点未配置离场坐标')
    expect(fixture.host.textContent).toContain('暂无可展示的离场站点坐标')

    fixture.records.value = []
    await nextTick()
    expect(fixture.host.textContent).toContain('暂无接驳线路')
    expect(fixture.host.textContent).not.toContain('离场定位 · 2 个站点')
  })
})
