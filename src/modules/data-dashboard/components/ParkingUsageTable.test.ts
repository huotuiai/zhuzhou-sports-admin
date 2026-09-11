// @vitest-environment jsdom
import type { App } from 'vue'
import type { ParkingUsageItem } from '../types'
import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ParkingUsageTable from './ParkingUsageTable.vue'

const mounted: Array<{ app: App, host: HTMLDivElement }> = []

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
})

async function mountTable(count = 12) {
  const items = ref<ParkingUsageItem[]>(Array.from({ length: count }, (_, index) => ({
    id: String(index + 1), code: `P${index + 1}`, name: `停车场 ${index + 1}`,
    total: 100, available: index * 8, used: 100 - index * 8, usageRate: 100 - index * 8,
  })))
  const canManage = ref(true)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { render: () => null } },
    { path: '/parking-management', name: 'parking-management', component: { render: () => null } },
  ] })
  await router.push('/')
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ setup: () => () => h(ParkingUsageTable, { items: items.value, canManage: canManage.value }) })
  app.use(router).mount(host)
  mounted.push({ app, host })
  await nextTick()
  return { host, items, canManage, router }
}

describe('parking usage table interaction', () => {
  it('renders eight non-interactive rows and updates filtering and sort without changing the overview', async () => {
    const { host } = await mountTable()
    const overview = host.querySelector('dl')!.textContent
    expect(host.querySelectorAll('tbody tr')).toHaveLength(8)
    expect(host.querySelector('tbody tr')!.textContent).toContain('停车场 1')
    expect(host.querySelector('tbody button, tbody a, tbody [role="button"]')).toBeNull()
    expect(host.querySelector('footer')!.textContent).toContain('共 12 个停车场')

    const sort = host.querySelector<HTMLButtonElement>('[role="combobox"]')!
    sort.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(3))
    const ascending = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
      .find(option => option.textContent?.includes('使用率：从低到高'))!
    ascending.focus()
    ascending.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(sort.textContent).toContain('使用率：从低到高'))
    expect(host.querySelector('tbody tr')!.textContent).toContain('停车场 12')
    expect(host.querySelector('footer')!.textContent).toContain('使用率从低到高')

    const full = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '已满')!
    full.click()
    await nextTick()
    expect(full.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('footer')!.textContent).toContain('符合条件 1 个')
    expect(host.querySelector('dl')!.textContent).toBe(overview)
    expect(host.querySelector('a')!.textContent).toContain('查看全部 12 个')
  })

  it('only offers navigation when there are more than eight lots and the user has permission', async () => {
    const { host, items, canManage, router } = await mountTable(8)
    expect(host.querySelector('a')).toBeNull()
    items.value.push({ id: '9', name: '新增停车场', total: 100, used: 0, available: 100, usageRate: 0 })
    await nextTick()
    expect(host.querySelector('a')!.getAttribute('href')).toBe('/parking-management')
    host.querySelector('a')!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(router.currentRoute.value.name).toBe('parking-management')
    canManage.value = false
    await nextTick()
    expect(host.querySelector('a')).toBeNull()
  })

  it('renders empty filters and empty snapshots with clear guidance', async () => {
    const { host, items } = await mountTable(1)
    Array.from(host.querySelectorAll('button')).find(button => button.textContent === '有空位')!.click()
    await nextTick()
    expect(host.textContent).toContain('没有符合条件的停车场')
    items.value = []
    await nextTick()
    expect(host.textContent).toContain('暂无停车场车位数据')
    expect(host.querySelector('a')).toBeNull()
  })
})
