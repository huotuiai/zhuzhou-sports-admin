// @vitest-environment jsdom
import type { App } from 'vue'
import type { ShuttleRouteCreateInput } from '../types'
import { createApp, h, nextTick, ref, shallowRef } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import ShuttleRouteForm from './ShuttleRouteForm.vue'

const mounted: Array<{ app: App, host: HTMLDivElement }> = []

function mountForm() {
  const model = shallowRef<ShuttleRouteCreateInput>({
    code: 'L9', name: '9.9最新路线', direction: 'inbound', description: '9.9最新路线覆盖站点',
    firstDeparture: '14:00:00', lastDeparture: '23:00:00',
    departureIntervalMinutes: 15, durationMinutes: 45, operatingStatus: 'operating', sortOrder: 0, enabled: true,
  })
  const form = ref<{ validateAndFocus(): boolean } | null>(null)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    setup: () => () => h(ShuttleRouteForm, {
      ref: form,
      mode: 'edit',
      value: model.value,
      'onUpdate:value': value => { model.value = value },
    }),
  })
  app.mount(host)
  mounted.push({ app, host })
  return {
    host, model, form,
    async fill(field: string, value: string) {
      const input = host.querySelector<HTMLInputElement>(`[data-field="${field}"]`)!
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

describe('shuttle route edit schedule', () => {
  it('allows saving an existing schedule after changing only the route name', async () => {
    const fixture = mountForm()
    await fixture.fill('name', '修改后的线路名称')

    expect(fixture.model.value.name).toBe('修改后的线路名称')
    expect(fixture.form.value?.validateAndFocus()).toBe(true)
    await nextTick()
    expect(fixture.host.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(fixture.host.textContent).not.toContain('请选择首班时间')
    expect(fixture.host.textContent).not.toContain('请选择末班时间')
  })

  it('still requires a cleared time and accepts it after the user restores it', async () => {
    const fixture = mountForm()
    await fixture.fill('firstDeparture', '')
    expect(fixture.form.value?.validateAndFocus()).toBe(false)
    await nextTick()
    expect(fixture.host.textContent).toContain('请选择首班时间')

    await fixture.fill('firstDeparture', '14:00')
    expect(fixture.form.value?.validateAndFocus()).toBe(true)
    await nextTick()
    expect(fixture.host.querySelector('[aria-invalid="true"]')).toBeNull()
  })
})
