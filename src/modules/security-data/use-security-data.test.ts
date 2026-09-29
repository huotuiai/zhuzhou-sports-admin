// @vitest-environment jsdom
import { effectScope, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECURITY_DATA } from './data'
import { useSecurityData } from './use-security-data'

describe('security data observation controls', () => {
  let scope: EffectScope

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T10:30:00+08:00'))
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  function createController() {
    return scope.run(() => useSecurityData())!
  }

  it('starts with the current Beijing window and all nine fixed metrics', () => {
    const data = createController()
    expect(data.window.value).toEqual({ date: '2026-09-22', period: 'morning' })
    expect(data.today.value).toBe('2026-09-22')
    expect(data.isCurrent.value).toBe(true)
    expect(data.visibleMetrics.value).toHaveLength(9)
    expect(data.activities.value).toHaveLength(4)
    expect(data.rankings).toBe(SECURITY_DATA.rankings)
    expect(data.rangeLabel.value).toBe('2026-09-22 08:00 – 2026-09-22 12:00')
  })

  it('hides online for historical windows without changing any fixed metric values', () => {
    const data = createController()
    const original = data.visibleMetrics.value.filter((metric) => metric.key !== 'online')
    data.selectPeriod('early')
    expect(data.isCurrent.value).toBe(false)
    expect(data.visibleMetrics.value).toEqual(original)
    data.selectDate('2026-09-21')
    data.selectPeriod('evening')
    expect(data.visibleMetrics.value).toEqual(original)
    expect(data.rankings).toBe(SECURITY_DATA.rankings)
    expect(data.activities.value).toHaveLength(2)
  })

  it('rejects future, empty and invalid dates while keeping the previous window', () => {
    const data = createController()
    const original = { ...data.window.value }
    for (const date of ['2026-09-23', '', '2026-02-30', '2026-9-22']) {
      data.selectDate(date)
      expect(data.dateError.value).not.toBe('')
      expect(data.window.value).toEqual(original)
    }
    data.selectDate('2026-09-20')
    expect(data.dateError.value).toBe('')
    expect(data.window.value.date).toBe('2026-09-20')
  })

  it('rejects unknown and not-yet-started periods, and adjusts a future period when returning to today', () => {
    const data = createController()
    expect(data.isPeriodDisabled('morning')).toBe(false)
    expect(data.isPeriodDisabled('afternoon')).toBe(true)
    data.selectPeriod('afternoon')
    data.selectPeriod('invalid')
    data.selectPeriod(undefined)
    expect(data.window.value.period).toBe('morning')
    data.selectDate('2026-09-21')
    expect(data.isPeriodDisabled('evening')).toBe(false)
    data.selectPeriod('evening')
    data.selectDate('2026-09-22')
    expect(data.window.value.period).toBe('morning')
    expect(data.isCurrent.value).toBe(true)
  })

  it('shows an empty activity state when the selected date has no overlapping activity', () => {
    const data = createController()
    data.selectDate('2026-08-01')
    expect(data.activities.value).toEqual([])
    expect(data.visibleMetrics.value).toHaveLength(8)
  })

  it('marks the selected window historical when the local clock crosses a period boundary', () => {
    vi.setSystemTime(new Date('2026-09-22T11:59:59+08:00'))
    const data = createController()
    expect(data.isCurrent.value).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(data.window.value.period).toBe('morning')
    expect(data.isCurrent.value).toBe(false)
    expect(data.visibleMetrics.value).toHaveLength(8)
    expect(data.isPeriodDisabled('afternoon')).toBe(false)
  })

  it('updates the date boundary while keeping the selected historical window', () => {
    vi.setSystemTime(new Date('2026-09-22T23:59:59+08:00'))
    const data = createController()
    vi.advanceTimersByTime(1000)
    expect(data.today.value).toBe('2026-09-23')
    expect(data.isCurrent.value).toBe(false)
    expect(data.window.value).toEqual({ date: '2026-09-22', period: 'evening' })
    expect(data.visibleMetrics.value).toHaveLength(8)
  })

  it('starts fresh in the current window on remount', () => {
    const data = createController()
    data.selectDate('2026-09-20')
    vi.setSystemTime(new Date('2026-09-22T19:00:00+08:00'))
    scope.stop()
    scope = effectScope()
    expect(createController().window.value).toEqual({ date: '2026-09-22', period: 'evening' })
  })

  it('disposes the local clock when the page scope stops', () => {
    createController()
    expect(vi.getTimerCount()).toBe(1)
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
