import { computed, ref } from 'vue'
import { useNow } from '@vueuse/core'
import { SECURITY_DATA } from './data'
import {
  activitiesForDate,
  beijingToday,
  currentObservationWindow,
  isCurrentObservationWindow,
  isPeriodAvailable,
  isValidObservationDate,
  observationRange,
  SECURITY_PERIODS,
} from './lib/observation-window'
import type { ObservationWindow, SecurityPeriod } from './types'

export function useSecurityData() {
  // Only the observation-window status follows the clock; no business-data polling occurs.
  const now = useNow({ interval: 1000 })
  const window = ref<ObservationWindow>(currentObservationWindow(now.value))
  const dateError = ref('')
  const today = computed(() => beijingToday(now.value))
  const isCurrent = computed(() => isCurrentObservationWindow(window.value, now.value))
  const rangeLabel = computed(() => observationRange(window.value).label)
  const visibleMetrics = computed(() => isCurrent.value
    ? SECURITY_DATA.metrics
    : SECURITY_DATA.metrics.filter((metric) => metric.key !== 'online'))
  const activities = computed(() => activitiesForDate(SECURITY_DATA.activities, window.value.date))

  function selectDate(value: string) {
    if (!isValidObservationDate(value)) {
      dateError.value = '请选择有效的观测日期'
      return
    }
    if (value > today.value) {
      dateError.value = '不能选择未来日期'
      return
    }
    const period = isPeriodAvailable(value, window.value.period, now.value)
      ? window.value.period
      : currentObservationWindow(now.value).period
    window.value = { date: value, period }
    dateError.value = ''
  }

  function selectPeriod(value: unknown) {
    const period = SECURITY_PERIODS.find((item) => item.value === value)
    if (!period || !isPeriodAvailable(window.value.date, period.value, now.value)) return
    window.value = { ...window.value, period: period.value }
    dateError.value = ''
  }

  function isPeriodDisabled(period: SecurityPeriod) {
    return !isPeriodAvailable(window.value.date, period, now.value)
  }

  return {
    window,
    today,
    isCurrent,
    rangeLabel,
    visibleMetrics,
    activities,
    rankings: SECURITY_DATA.rankings,
    dateError,
    selectDate,
    selectPeriod,
    isPeriodDisabled,
  }
}
