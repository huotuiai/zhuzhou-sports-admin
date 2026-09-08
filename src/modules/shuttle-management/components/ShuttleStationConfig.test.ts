// @vitest-environment jsdom
import type { App } from 'vue'
import type { ShuttleStation } from '../types'
import { createApp, h, nextTick, ref, shallowRef } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import ShuttleStationConfig from './ShuttleStationConfig.vue'

const mounted: Array<{ app: App, host: HTMLDivElement }> = []

function station(id: string): ShuttleStation {
  return { id, name: `站点 ${id}`, point: { lng: 113.1, lat: 27.8 }, navigationAddress: '入场导航', arrivalGateIds: ['gate-1'] }
}

function mountConfig(initial: ShuttleStation[] = []) {
  const model = shallowRef(initial)
  const form = ref<{ validateAndCommit(): boolean } | null>(null)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    setup: () => () => h(ShuttleStationConfig, {
      ref: form,
      routeId: 'route-1',
      value: model.value,
      'onUpdate:value': value => { model.value = value },
    }),
  })
  app.mount(host)
  mounted.push({ app, host })
  return {
    host, model, form,
    async click(text: string) {
      const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === text)
      if (!button) throw new Error(`Button not found: ${text}`)
      button.click()
      await nextTick()
    },
    async fill(id: string, value: string) {
      const input = host.querySelector<HTMLInputElement>(`#${id}`)!
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
    },
  }
}

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
})

describe('shuttle station directional fields', () => {
  it('requires both coordinates, permits empty navigation addresses and commits the latest draft on save', async () => {
    const fixture = mountConfig()
    await fixture.click('新增站点')
    await fixture.fill('station-name', '体育中心站')
    await fixture.click('添加到列表')
    expect(fixture.host.textContent).toContain('请输入入场定位经纬度')
    await fixture.fill('station-inbound-coordinate', '113.1,27.8')
    await fixture.click('添加到列表')
    expect(fixture.host.textContent).toContain('请输入离场定位经纬度')
    expect(fixture.model.value).toHaveLength(0)

    await fixture.fill('station-outbound-coordinate', '113.2,27.9')
    expect(fixture.form.value?.validateAndCommit()).toBe(true)
    await nextTick()
    expect(fixture.model.value[0]).toMatchObject({
      point: { lng: 113.1, lat: 27.8 }, navigationAddress: '',
      outboundPoint: { lng: 113.2, lat: 27.9 }, outboundNavigationAddress: '',
    })
    expect(fixture.host.textContent).toContain('入场导航：未配置')
    expect(fixture.host.textContent).toContain('离场导航：未配置')
  })

  it.each(['inbound', 'outbound'])('rejects invalid %s coordinates without updating the list', async (direction) => {
    const fixture = mountConfig()
    await fixture.click('新增站点')
    await fixture.fill('station-name', '体育中心站')
    await fixture.fill('station-inbound-coordinate', '113.1,27.8')
    await fixture.fill('station-outbound-coordinate', '113.2,27.9')
    await fixture.fill(`station-${direction}-coordinate`, '181,91')
    await fixture.click('添加到列表')

    expect(fixture.model.value).toHaveLength(0)
    expect(fixture.host.querySelector(`#station-${direction}-coordinate`)?.getAttribute('aria-invalid')).toBe('true')
  })

  it('allows legacy stations to be completed one at a time and retains both sets of fields when reordered', async () => {
    const initial = [station('S1'), station('S2')]
    const fixture = mountConfig(initial)
    await fixture.click('编辑')
    expect(fixture.host.querySelector<HTMLInputElement>('#station-outbound-coordinate')?.value).toBe('')
    await fixture.fill('station-outbound-coordinate', '113.2,27.9')
    await fixture.fill('station-outbound-address', ' 离场导航 ')
    await fixture.click('更新站点')

    expect(fixture.model.value[0]).toMatchObject({ outboundPoint: { lng: 113.2, lat: 27.9 }, outboundNavigationAddress: '离场导航', arrivalGateIds: ['gate-1'] })
    expect(fixture.form.value?.validateAndCommit()).toBe(false)
    await nextTick()
    expect(fixture.host.querySelector<HTMLInputElement>('#station-name')?.value).toBe('站点 S2')
    await fixture.fill('station-outbound-coordinate', '113.3,28')
    await fixture.click('更新站点')
    expect(fixture.form.value?.validateAndCommit()).toBe(true)

    fixture.host.querySelector<HTMLButtonElement>('[aria-label="下移站点 S1"]')!.click()
    await nextTick()
    expect(fixture.model.value.map(item => item.id)).toEqual(['S2', 'S1'])
    expect(fixture.model.value[1]).toMatchObject({ point: initial[0]!.point, navigationAddress: '入场导航', outboundPoint: { lng: 113.2, lat: 27.9 }, outboundNavigationAddress: '离场导航' })
    expect(initial[0]).not.toHaveProperty('outboundPoint')
  })

  it('discards cancelled edits without changing either set of saved draft coordinates', async () => {
    const original = { ...station('S1'), outboundPoint: { lng: 113.2, lat: 27.9 }, outboundNavigationAddress: '离场导航' }
    const fixture = mountConfig([original])
    await fixture.click('编辑')
    await fixture.fill('station-inbound-address', '修改入场导航')
    await fixture.fill('station-outbound-coordinate', '114,28')
    await fixture.click('取消编辑')
    expect(fixture.model.value).toEqual([original])
  })
})
