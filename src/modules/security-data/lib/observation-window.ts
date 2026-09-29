import type { ObservationWindow, SecurityActivity, SecurityPeriod } from '../types'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const BEIJING_OFFSET = 8 * HOUR

export const SECURITY_PERIODS: readonly {
  value: SecurityPeriod
  label: string
  startHour: number
  endHour: number
}[] = [
  { value: 'early', label: '凌晨（00:00–08:00）', startHour: 0, endHour: 8 },
  { value: 'morning', label: '上午（08:00–12:00）', startHour: 8, endHour: 12 },
  { value: 'afternoon', label: '下午（12:00–18:00）', startHour: 12, endHour: 18 },
  { value: 'evening', label: '晚场（18:00–次日 00:00）', startHour: 18, endHour: 24 },
]

function beijingDateTime(date: Date): string {
  return new Date(date.getTime() + BEIJING_OFFSET).toISOString().slice(0, 16).replace('T', ' ')
}

/** Date-input values are calendar dates in Beijing, regardless of the browser timezone. */
export function isValidObservationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00+08:00`)
  return Number.isFinite(date.getTime()) && beijingToday(date) === value
}

export function beijingToday(now: Date): string {
  return new Date(now.getTime() + BEIJING_OFFSET).toISOString().slice(0, 10)
}

export function currentObservationWindow(now: Date): ObservationWindow {
  const hour = new Date(now.getTime() + BEIJING_OFFSET).getUTCHours()
  const period = SECURITY_PERIODS.find((item) => hour >= item.startHour && hour < item.endHour)
  if (!period) throw new RangeError('Invalid observation time')
  return { date: beijingToday(now), period: period.value }
}

export function observationRange(window: ObservationWindow): { start: Date; end: Date; label: string } {
  const period = SECURITY_PERIODS.find((item) => item.value === window.period)
  if (!isValidObservationDate(window.date) || !period) throw new RangeError('Invalid observation window')
  const midnight = new Date(`${window.date}T00:00:00+08:00`).getTime()
  const start = new Date(midnight + period.startHour * HOUR)
  const end = new Date(midnight + period.endHour * HOUR)
  return { start, end, label: `${beijingDateTime(start)} – ${beijingDateTime(end)}` }
}

export function isCurrentObservationWindow(window: ObservationWindow, now: Date): boolean {
  if (!Number.isFinite(now.getTime()) || !isValidObservationDate(window.date)) return false
  const current = currentObservationWindow(now)
  return current.date === window.date && current.period === window.period
}

export function isPeriodAvailable(date: string, period: SecurityPeriod, now: Date): boolean {
  if (!isValidObservationDate(date) || !Number.isFinite(now.getTime())) return false
  if (!SECURITY_PERIODS.some((item) => item.value === period)) return false
  return observationRange({ date, period }).start.getTime() <= now.getTime()
}

export function activitiesForDate(activities: readonly SecurityActivity[], date: string): SecurityActivity[] {
  if (!isValidObservationDate(date)) return []
  const dayStart = new Date(`${date}T00:00:00+08:00`).getTime()
  const dayEnd = dayStart + DAY
  return activities.filter((activity) => {
    const start = new Date(activity.startAt).getTime()
    const end = new Date(activity.endAt).getTime()
    return end > start && start < dayEnd && end > dayStart
  })
}

export function formatActivityRange(activity: SecurityActivity): string {
  return `${beijingDateTime(new Date(activity.startAt))} – ${beijingDateTime(new Date(activity.endAt))}`
}
