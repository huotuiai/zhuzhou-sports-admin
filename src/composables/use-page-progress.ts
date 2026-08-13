import { readonly, ref } from 'vue'

const visible = ref(false)
const progress = ref(0)

const SHOW_DELAY = 120
const MINIMUM_VISIBLE = 220
const COMPLETE_DURATION = 180

let showTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
let trickleTimer: ReturnType<typeof setInterval> | undefined
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

function clearTrickleTimer() {
  if (trickleTimer === undefined) return
  globalThis.clearInterval(trickleTimer)
  trickleTimer = undefined
}

function start() {
  clearShowTimer()
  clearHideTimer()
  clearTrickleTimer()

  visible.value = false
  progress.value = 0
  showTimer = globalThis.setTimeout(() => {
    showTimer = undefined
    visibleSince = Date.now()
    progress.value = 9
    visible.value = true

    trickleTimer = globalThis.setInterval(() => {
      const remaining = 88 - progress.value
      if (remaining <= 0) return
      progress.value = Math.min(88, progress.value + Math.max(1, remaining * 0.12))
    }, 160)
  }, SHOW_DELAY)
}

function finish() {
  clearShowTimer()
  clearTrickleTimer()

  if (!visible.value) {
    progress.value = 0
    return
  }

  const remaining = Math.max(0, MINIMUM_VISIBLE - (Date.now() - visibleSince))
  clearHideTimer()
  hideTimer = globalThis.setTimeout(() => {
    progress.value = 100
    hideTimer = globalThis.setTimeout(() => {
      visible.value = false
      progress.value = 0
      hideTimer = undefined
    }, COMPLETE_DURATION)
  }, remaining)
}

export const pageProgress = {
  visible: readonly(visible),
  progress: readonly(progress),
  start,
  finish,
}
