import type { MaybeRefOrGetter, Ref } from 'vue'
import { onScopeDispose, readonly, ref, toValue, watch } from 'vue'

interface DelayedLoadingOptions {
  /** Wait before showing a loading indicator so fast operations do not flash. */
  delay?: number
  /** Keep a visible indicator on screen long enough to remain perceptible. */
  minimumVisible?: number
}

export function useDelayedLoading(
  source: MaybeRefOrGetter<boolean>,
  options: DelayedLoadingOptions = {},
): Readonly<Ref<boolean>> {
  const delay = Math.max(0, options.delay ?? 120)
  const minimumVisible = Math.max(0, options.minimumVisible ?? 240)
  const visible = ref(false)

  let showTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let visibleSince = 0

  function clearShowTimer() {
    if (showTimer === undefined) return
    globalThis.clearTimeout(showTimer)
    showTimer = undefined
  }

  function clearHideTimer() {
    if (hideTimer === undefined) return
    globalThis.clearTimeout(hideTimer)
    hideTimer = undefined
  }

  function show() {
    clearHideTimer()
    if (visible.value || showTimer !== undefined) return

    showTimer = globalThis.setTimeout(() => {
      showTimer = undefined
      visibleSince = Date.now()
      visible.value = true
    }, delay)
  }

  function hide() {
    clearShowTimer()
    if (!visible.value) return

    const remaining = Math.max(0, minimumVisible - (Date.now() - visibleSince))
    clearHideTimer()
    hideTimer = globalThis.setTimeout(() => {
      hideTimer = undefined
      visible.value = false
    }, remaining)
  }

  watch(
    () => Boolean(toValue(source)),
    (pending) => pending ? show() : hide(),
    { immediate: true },
  )

  onScopeDispose(() => {
    clearShowTimer()
    clearHideTimer()
  })

  return readonly(visible)
}
