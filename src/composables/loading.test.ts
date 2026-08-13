import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDelayedLoading } from './use-delayed-loading'
import { pageProgress } from './use-page-progress'

describe('loading feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    pageProgress.finish()
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('does not flash delayed feedback for fast operations', async () => {
    const scope = effectScope()
    const loading = ref(false)
    const visible = scope.run(() => useDelayedLoading(loading, { delay: 120 }))!

    loading.value = true
    await nextTick()
    vi.advanceTimersByTime(80)
    loading.value = false
    await nextTick()
    vi.advanceTimersByTime(100)

    expect(visible.value).toBe(false)
    scope.stop()
  })

  it('keeps delayed feedback visible for the configured minimum time', async () => {
    const scope = effectScope()
    const loading = ref(false)
    const visible = scope.run(() => useDelayedLoading(loading, {
      delay: 120,
      minimumVisible: 240,
    }))!

    loading.value = true
    await nextTick()
    vi.advanceTimersByTime(120)
    expect(visible.value).toBe(true)

    loading.value = false
    await nextTick()
    vi.advanceTimersByTime(239)
    expect(visible.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(visible.value).toBe(false)
    scope.stop()
  })

  it('delays page progress and completes it before hiding', () => {
    pageProgress.start()
    vi.advanceTimersByTime(119)
    expect(pageProgress.visible.value).toBe(false)

    vi.advanceTimersByTime(1)
    expect(pageProgress.visible.value).toBe(true)
    expect(pageProgress.progress.value).toBe(9)

    pageProgress.finish()
    vi.advanceTimersByTime(220)
    expect(pageProgress.progress.value).toBe(100)
    vi.advanceTimersByTime(180)
    expect(pageProgress.visible.value).toBe(false)
  })
})
