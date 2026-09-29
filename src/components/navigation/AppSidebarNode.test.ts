// @vitest-environment jsdom
import type { App } from 'vue'
import type { AuthorizedNavigationDirectory, AuthorizedNavigationItem, AuthorizedNavigationPlaceholder } from '@/config/navigation'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SidebarMenu, SidebarProvider } from '@/components/ui/sidebar'
import AppSidebarNode from './AppSidebarNode.vue'

const mounted: Array<{ app: App, host: HTMLDivElement }> = []
const icon = () => h('svg')
const page: AuthorizedNavigationItem = {
  kind: 'page', id: 'operations', label: '运营数据', icon,
  path: '/', routeName: 'data-dashboard', permission: 'dashboard:view',
}
const placeholder: AuthorizedNavigationPlaceholder = {
  kind: 'placeholder', id: 'security-placeholder', label: '安保数据', icon,
  description: '安保数据尚未开放',
}
const directory: AuthorizedNavigationDirectory = {
  kind: 'directory', id: 'data-display', label: '数据展示', icon,
  children: [page, placeholder],
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => {
  for (const { app, host } of mounted.splice(0)) {
    app.unmount()
    host.remove()
  }
})

afterAll(() => vi.unstubAllGlobals())

async function mountNode(item: AuthorizedNavigationDirectory = directory, { collapsed = false, path = '/' } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'data-dashboard', component: { render: () => null } },
      { path: '/other', name: 'other', component: { render: () => null } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    render: () => h(SidebarProvider, { defaultOpen: !collapsed }, {
      default: () => h(SidebarMenu, {}, { default: () => h(AppSidebarNode, { item }) }),
    }),
  })
  app.use(router)
  app.mount(host)
  mounted.push({ app, host })
  await nextTick()
  return { host, router }
}

describe('nested sidebar navigation', () => {
  it('opens active page ancestors, allows collapsing them, and reopens after navigation', async () => {
    const nested: AuthorizedNavigationDirectory = {
      ...directory,
      children: [{ ...directory, id: 'nested', label: '子目录', children: [page] }],
    }
    const { host, router } = await mountNode(nested)
    const parent = host.querySelector<HTMLButtonElement>('button[aria-label="数据展示"]')!
    const child = host.querySelector<HTMLButtonElement>('button[aria-label="子目录"]')!
    expect(parent.getAttribute('aria-expanded')).toBe('true')
    expect(child.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('a[aria-current="page"]')?.textContent).toContain('运营数据')

    parent.click()
    await nextTick()
    expect(parent.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(parent.getAttribute('aria-controls')!)?.style.display).toBe('none')

    await router.push('/other')
    await router.push('/')
    await nextTick()
    expect(parent.getAttribute('aria-expanded')).toBe('true')
    expect(child.getAttribute('aria-expanded')).toBe('true')
  })

  it('renders the future security entry as a disabled button with an accessible explanation', async () => {
    const { host, router } = await mountNode()
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="安保数据，待开放"]')!
    expect(button.disabled).toBe(true)
    expect(button.textContent).toContain('待开放')
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(placeholder.description)
    expect([...host.querySelectorAll('a')].some(link => link.textContent?.includes('安保数据'))).toBe(false)
    button.click()
    await nextTick()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('opens the collapsed directory by keyboard and keeps pages reachable without enabling placeholders', async () => {
    const { host, router } = await mountNode(directory, { collapsed: true, path: '/other' })
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="数据展示"]')!
    trigger.focus()
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(document.querySelector('[data-slot="dropdown-menu-content"]')).not.toBeNull())
    const content = document.querySelector('[data-slot="dropdown-menu-content"]')!
    const link = content.querySelector<HTMLAnchorElement>('a')!
    expect(link.textContent).toContain('运营数据')
    expect(content.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true)
    expect(content.textContent).toContain('待开放')
    link.click()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
  })

  it('supports nested keyboard submenus while the sidebar is collapsed', async () => {
    const nested: AuthorizedNavigationDirectory = {
      ...directory,
      children: [{ ...directory, id: 'nested', label: '子目录', children: [page] }],
    }
    const { host } = await mountNode(nested, { collapsed: true })
    host.querySelector<HTMLButtonElement>('button[aria-label="数据展示"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(document.querySelector('[data-slot="dropdown-menu-sub-trigger"]')).not.toBeNull())
    const subTrigger = document.querySelector<HTMLElement>('[data-slot="dropdown-menu-sub-trigger"]')!
    subTrigger.focus()
    subTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await vi.waitFor(() => expect(document.querySelector('[data-slot="dropdown-menu-sub-content"] a')?.textContent).toContain('运营数据'))
  })
})
