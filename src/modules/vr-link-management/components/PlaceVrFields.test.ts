// @vitest-environment jsdom
import type { App, Component } from 'vue'
import type { SeatZoneWriteInput } from '@/modules/seat-management/types'
import type { ParkingLotFormValue } from '@/modules/parking-management/types'
import type { TicketGateWriteInput } from '@/modules/ticket-gate-management/types'
import { createApp, h, nextTick, ref, shallowRef } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import VenueSeatForm from '@/modules/seat-management/components/VenueSeatForm.vue'
import ParkingLotForm from '@/modules/parking-management/components/ParkingLotForm.vue'
import TicketGateForm from '@/modules/ticket-gate-management/components/TicketGateForm.vue'

const mounted: Array<{ app: App, host: HTMLDivElement }> = []
const cases: Array<{ name: string, component: Component, value: object, props?: object }> = [
  {
    name: 'seat zone', component: VenueSeatForm,
    value: {
      code: 'A-01', name: 'A 区', floorId: '11', rowStart: 1, rowEnd: 30,
      gateIds: ['21'], sortOrder: 1, status: 'enabled', remark: '',
    } satisfies SeatZoneWriteInput,
    props: {
      floors: [{ id: '11', name: '一层', sortOrder: 1, status: 'enabled', zoneCount: 1, createdAt: '', updatedAt: '' }],
      ticketGates: [{ id: '21', code: 'G-01', name: '东门', openStatus: 'open', enabled: true, matchOpen: true }],
    },
  },
  {
    name: 'parking lot', component: ParkingLotForm,
    value: {
      code: 'P-01', name: '东停车场', locationDescription: '', coordinateInput: '113.1,27.8', navigationAddress: '',
      totalSpaces: 100, availabilityUpdateMethod: 'manual', feeType: 'free', feeStandard: '', openStatus: 'open',
      enabled: true, recommendationWeight: 50, sortOrder: 1, remark: '', nearbyGateBindings: [],
    } satisfies ParkingLotFormValue,
  },
  {
    name: 'ticket gate', component: TicketGateForm,
    value: {
      code: 'G-01', name: '东门', floorId: '11', locationDescription: '', mapCoordinates: '113.1,27.8',
      navigationAddress: '', sortOrder: 1, status: 'open', statusRemark: '',
    } satisfies TicketGateWriteInput,
    props: { floors: [{ id: '11', name: '一层', enabled: true, sortOrder: 1 }] },
  },
]

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
})

describe.each(cases)('$name optional VR field', (testCase) => {
  it.each(['create', 'edit'])('supports display, validation, editing and clearing in %s mode', async (mode) => {
    const model = shallowRef({ ...testCase.value, vrUrl: mode === 'edit' ? 'https://example.com/existing' : '' })
    const form = ref<{ validateAndFocus(): boolean } | null>(null)
    const saving = ref(false)
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      setup: () => () => h(testCase.component, {
        ...testCase.props, ref: form, mode, value: model.value, saving: saving.value,
        'onUpdate:value': (value: typeof model.value) => { model.value = value },
      }),
    })
    app.mount(host)
    mounted.push({ app, host })
    const input = host.querySelector<HTMLInputElement>('input[data-field="vrUrl"]')!
    expect(input).not.toBeNull()
    expect(input.value).toBe(model.value.vrUrl)
    expect(input.required).toBe(false)
    expect(host.textContent).toContain('VR 链接（选填）')
    const fill = async (value: string) => {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
    }

    await fill('javascript:alert(1)')
    expect(form.value?.validateAndFocus()).toBe(false)
    await nextTick()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(host.textContent).toContain('请输入以 http:// 或 https:// 开头的有效 VR 链接')

    await fill('https://example.com/vr?token=A%2Fb#view')
    expect(model.value.vrUrl).toBe('https://example.com/vr?token=A%2Fb#view')
    expect(form.value?.validateAndFocus()).toBe(true)
    await fill('')
    expect(model.value.vrUrl).toBe('')
    expect(form.value?.validateAndFocus()).toBe(true)
    saving.value = true
    await nextTick()
    expect(input.disabled).toBe(true)
  })
})
