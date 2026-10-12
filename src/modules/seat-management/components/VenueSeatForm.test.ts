// @vitest-environment jsdom
import type { App } from 'vue'
import type { SeatFloor, SeatGateOption, SeatZoneWriteInput } from '../types'
import { createApp, h, nextTick, ref, shallowRef } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import VenueSeatForm from './VenueSeatForm.vue'

const mounted: Array<{ app: App, host: HTMLDivElement }> = []
const coverageGeometry = JSON.stringify([
  { lng: 113.096571, lat: 27.841963 }, { lng: 113.099628, lat: 27.841963 },
  { lng: 113.099628, lat: 27.843168 }, { lng: 113.096571, lat: 27.843168 },
  { lng: 113.096571, lat: 27.841963 },
])
const floors: SeatFloor[] = [
  { id: '11', name: '一层', sortOrder: 1, status: 'enabled', zoneCount: 1, createdAt: '', updatedAt: '' },
]
const ticketGates: SeatGateOption[] = [
  { id: '21', code: 'G-01', name: '东门', openStatus: 'open', enabled: true, matchOpen: true },
]

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
})

describe('VenueSeatForm exit navigation and coverage', () => {
  it.each(['create', 'edit'] as const)('supports optional fields and focuses invalid input in %s mode', async (mode) => {
    const model = shallowRef<SeatZoneWriteInput>({
      code: 'A-01', name: 'A 区', floorId: '11', rowStart: 1, rowEnd: 30,
      gateIds: ['21'], sortOrder: 1, status: 'enabled', remark: '', viewVrUrl: '',
      exitVrUrl: mode === 'edit' ? 'https://example.com/existing-exit' : '',
      coverageGeometry: mode === 'edit' ? coverageGeometry : '',
    })
    const form = ref<{ validateAndFocus(): boolean } | null>(null)
    const saving = ref(false)
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      setup: () => () => h(VenueSeatForm, {
        ref: form, mode, value: model.value, floors, ticketGates, saving: saving.value,
        'onUpdate:value': (value: SeatZoneWriteInput) => { model.value = value },
      }),
    })
    app.mount(host)
    mounted.push({ app, host })

    const exitInput = host.querySelector<HTMLInputElement>('input[data-field="exitVrUrl"]')!
    const coverageInput = host.querySelector<HTMLTextAreaElement>('textarea[data-field="coverageGeometry"]')!
    expect(exitInput).not.toBeNull()
    expect(coverageInput).not.toBeNull()
    expect(exitInput.value).toBe(model.value.exitVrUrl)
    expect(coverageInput.value).toBe(model.value.coverageGeometry)
    expect(exitInput.required).toBe(false)
    expect(coverageInput.required).toBe(false)
    expect(host.querySelector(`label[for="${exitInput.id}"]`)?.textContent).toContain('分区离场 VR 链接')
    expect(host.querySelector(`label[for="${coverageInput.id}"]`)?.textContent).toContain('分区覆盖范围')
    expect(host.textContent).toContain('GCJ-02 坐标对象数组')
    expect(form.value?.validateAndFocus()).toBe(true)

    const fill = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
    }

    await fill(exitInput, '')
    await fill(coverageInput, '')
    expect(form.value?.validateAndFocus()).toBe(true)
    expect(exitInput.getAttribute('aria-invalid')).toBe('false')
    expect(coverageInput.getAttribute('aria-invalid')).toBe('false')

    await fill(exitInput, 'javascript:alert(1)')
    expect(form.value?.validateAndFocus()).toBe(false)
    await nextTick()
    expect(document.activeElement).toBe(exitInput)
    expect(exitInput.getAttribute('aria-invalid')).toBe('true')

    await fill(exitInput, 'https://example.com/exit?zone=A-01#route')
    expect(model.value.exitVrUrl).toBe('https://example.com/exit?zone=A-01#route')
    await fill(coverageInput, '{bad')
    expect(form.value?.validateAndFocus()).toBe(false)
    await nextTick()
    expect(document.activeElement).toBe(coverageInput)
    expect(exitInput.getAttribute('aria-invalid')).toBe('false')
    expect(coverageInput.getAttribute('aria-invalid')).toBe('true')
    await fill(coverageInput, coverageGeometry)
    expect(model.value.coverageGeometry).toBe(coverageGeometry)
    expect(model.value.viewVrUrl).toBe('')
    expect(form.value?.validateAndFocus()).toBe(true)
    expect(coverageInput.getAttribute('aria-invalid')).toBe('false')

    saving.value = true
    await nextTick()
    expect(exitInput.disabled).toBe(true)
    expect(coverageInput.disabled).toBe(true)
    expect(form.value?.validateAndFocus()).toBe(false)
  })
})
