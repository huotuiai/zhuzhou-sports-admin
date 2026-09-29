// @vitest-environment jsdom
import type { App, Component } from 'vue'
import type { SecurityRanking } from '../types'
import { createApp, h, nextTick } from 'vue'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import SecurityDataView from '@/views/SecurityDataView.vue'
import SecurityRankingCard from './SecurityRankingCard.vue'

const mounted: Array<{ app: App, host: HTMLDivElement }> = []

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
  vi.useRealTimers()
})

afterAll(() => vi.unstubAllGlobals())

async function mount(component: Component) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(component)
  app.mount(host)
  mounted.push({ app, host })
  await nextTick()
  return host
}

async function setDate(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('#security-date')!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
  await nextTick()
  return input
}

describe('security presentation page', () => {
  it('keeps fixed metrics while switching windows and restores the current date and online card', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-09-22T10:30:00+08:00'))
    const host = await mount(SecurityDataView)
    expect(host.textContent).not.toContain('示例数据')
    expect(host.textContent).not.toContain('回到当前时段')
    expect(host.querySelector('[data-testid="security-window-status"]')).toBeNull()
    expect(host.querySelectorAll('[data-testid="security-metric"]')).toHaveLength(9)
    expect(host.querySelectorAll('[data-testid="security-ranking"]')).toHaveLength(5)
    expect(host.querySelectorAll('[data-testid="security-ranking-row"]')).toHaveLength(30)
    const sample = host.querySelector('[data-metric-key="sample"] strong')!.textContent
    expect(host.querySelector('#security-period')?.textContent).toContain('上午')

    await setDate(host, '2026-09-21')
    expect(host.querySelectorAll('[data-testid="security-metric"]')).toHaveLength(8)
    expect(host.querySelector('[data-metric-key="online"]')).toBeNull()
    expect(host.querySelector('[data-metric-key="sample"] strong')!.textContent).toBe(sample)
    expect(host.querySelector('[data-testid="security-window-range"]')?.textContent).toBe('2026-09-21 08:00 – 2026-09-21 12:00')

    await setDate(host, '2026-09-01')
    expect(host.querySelector('[data-testid="security-activities-empty"]')?.textContent).toContain('所选日期暂无活动')
    await setDate(host, '2026-09-22')
    expect(host.querySelector<HTMLInputElement>('#security-date')?.value).toBe('2026-09-22')
    expect(host.querySelectorAll('[data-testid="security-metric"]')).toHaveLength(9)
    expect(host.querySelector('[data-testid="security-activities-empty"]')).toBeNull()
  })

  it('preserves the five prototype ranking groups and displays top 12 as two ordered columns', async () => {
    const host = await mount(SecurityDataView)
    const cards = [...host.querySelectorAll<HTMLElement>('[data-testid="security-ranking"]')]
    expect(cards.map(card => card.dataset.rankingId)).toEqual(['entry-shuttle', 'entry-gate', 'entry-zone', 'exit-shuttle', 'exit-zone'])
    expect(cards.map(card => card.querySelectorAll('[data-testid="security-ranking-row"]').length)).toEqual([4, 4, 6, 4, 12])
    for (const card of cards) {
      expect(card.querySelector('[data-slot="badge"], footer, :scope > p')).toBeNull()
      expect(card.textContent).not.toContain('选择人数')
      expect(card.textContent).not.toContain('仅显示前')
    }
    expect(cards[0]!.querySelector('[data-testid="security-ranking-row"] > span')?.textContent).toBe('L1')
    expect(cards[2]!.querySelector('[data-testid="security-ranking-row"] > span')?.textContent).toBe('45区')

    const wideCard = cards[4]!
    const columns = [...wideCard.querySelectorAll('ol')]
    expect(columns).toHaveLength(2)
    expect(columns.map(column => [...column.querySelectorAll<HTMLElement>('[data-testid="security-ranking-row"]')].map(row => row.dataset.rankingItem))).toEqual([
      ['45', '2', '18', '33', '13', '1'],
      ['35', '21', '28', '3', '23', '12'],
    ])
    for (const card of cards) {
      for (const column of card.querySelectorAll('ol')) {
        const bars = [...column.querySelectorAll<HTMLElement>('[data-testid="security-ranking-bar"]')]
        expect(bars[0]!.classList.contains('bg-[#ff0800]')).toBe(true)
        expect(bars[1]!.classList.contains('bg-[#eb9e3e]')).toBe(true)
        expect(bars.slice(2).every(bar => bar.classList.contains('bg-[#15a14a]'))).toBe(true)
      }
    }
  })

  it('rejects future or empty date input and disables upcoming periods in the select', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-09-22T10:30:00+08:00'))
    const host = await mount(SecurityDataView)
    const future = await setDate(host, '2026-09-23')
    expect(future.value).toBe('2026-09-22')
    expect(future.getAttribute('max')).toBe('2026-09-22')
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('不能选择未来日期')
    const empty = await setDate(host, '')
    expect(empty.value).toBe('2026-09-22')
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('请选择有效的观测日期')

    const period = host.querySelector<HTMLButtonElement>('#security-period')!
    period.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(4))
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options.filter(option => option.getAttribute('aria-disabled') === 'true').map(option => option.textContent)).toEqual([
      expect.stringContaining('下午'), expect.stringContaining('晚场'),
    ])
    const early = options.find(option => option.textContent?.includes('凌晨'))!
    early.focus()
    early.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(period.textContent).toContain('凌晨'))
    expect(host.querySelectorAll('[data-testid="security-metric"]')).toHaveLength(8)
    expect(host.querySelector<HTMLInputElement>('#security-date')?.value).toBe('2026-09-22')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('sorts and limits rankings against the full denominator, and exposes full values on keyboard focus', async () => {
    const ranking: SecurityRanking = {
      id: 'test', title: '入场分区', description: '测试口径', total: 1000, limit: 6,
      items: [
        { id: 'last', label: '最后分区', count: 10 },
        { id: 'first', label: '一个需要完整展示的很长分区名称', count: 300 },
        { id: 'second', label: '2 区', count: 200 },
        { id: 'third', label: '3 区', count: 150 },
        { id: 'fourth', label: '4 区', count: 100 },
        { id: 'fifth', label: '5 区', count: 90 },
        { id: 'sixth', label: '6 区', count: 80 },
      ],
    }
    const host = await mount({ render: () => h(TooltipProvider, { delayDuration: 0 }, { default: () => h(SecurityRankingCard, { ranking }) }) })
    const rows = [...host.querySelectorAll<HTMLElement>('[data-testid="security-ranking-row"]')]
    expect(rows.map(row => row.dataset.rankingItem)).toEqual(['first', 'second', 'third', 'fourth', 'fifth', 'sixth'])
    expect(rows[0]!.querySelector<HTMLElement>('[data-testid="security-ranking-bar"]')?.style.width).toBe('30%')
    expect(rows[0]!.getAttribute('aria-label')).toBe('一个需要完整展示的很长分区名称，300 人，占比 30%')
    expect(host.querySelector('button, a, [role="button"]')).toBeNull()
    rows[0]!.focus()
    await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('一个需要完整展示的很长分区名称，300 人，占比 30%'))
  })
})
