import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SecurityActivity, SecurityPeriod } from '../types'
import {
  activitiesForDate,
  beijingToday,
  currentObservationWindow,
  formatActivityRange,
  isCurrentObservationWindow,
  isPeriodAvailable,
  isValidObservationDate,
  observationRange,
  SECURITY_PERIODS,
} from './observation-window'

afterEach(() => vi.unstubAllEnvs())

describe('Beijing observation windows', () => {
  it.each([
    ['2026-09-21T23:59:59.999+08:00', '2026-09-21', 'evening'],
    ['2026-09-22T00:00:00+08:00', '2026-09-22', 'early'],
    ['2026-09-22T07:59:59.999+08:00', '2026-09-22', 'early'],
    ['2026-09-22T08:00:00+08:00', '2026-09-22', 'morning'],
    ['2026-09-22T11:59:59.999+08:00', '2026-09-22', 'morning'],
    ['2026-09-22T12:00:00+08:00', '2026-09-22', 'afternoon'],
    ['2026-09-22T17:59:59.999+08:00', '2026-09-22', 'afternoon'],
    ['2026-09-22T18:00:00+08:00', '2026-09-22', 'evening'],
    ['2026-09-23T00:00:00+08:00', '2026-09-23', 'early'],
  ])('assigns %s to its half-open period', (instant, date, period) => {
    expect(currentObservationWindow(new Date(instant))).toEqual({ date, period })
  })

  it.each(['UTC', 'America/New_York', 'Pacific/Honolulu'])('ignores system timezone %s', (timezone) => {
    vi.stubEnv('TZ', timezone)
    const now = new Date('2026-09-21T17:00:00Z')
    expect(beijingToday(now)).toBe('2026-09-22')
    expect(currentObservationWindow(now)).toEqual({ date: '2026-09-22', period: 'early' })
    expect(observationRange({ date: '2026-09-22', period: 'morning' }).start.toISOString())
      .toBe('2026-09-22T00:00:00.000Z')
  })

  it('formats a complete evening range across the year boundary', () => {
    const range = observationRange({ date: '2026-12-31', period: 'evening' })
    expect(range.start.toISOString()).toBe('2026-12-31T10:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-12-31T16:00:00.000Z')
    expect(range.label).toBe('2026-12-31 18:00 – 2027-01-01 00:00')
  })

  it('does not treat an ended period or a future period as current', () => {
    const now = new Date('2026-09-22T12:00:00+08:00')
    expect(isCurrentObservationWindow({ date: '2026-09-22', period: 'morning' }, now)).toBe(false)
    expect(isCurrentObservationWindow({ date: '2026-09-22', period: 'afternoon' }, now)).toBe(true)
    expect(isCurrentObservationWindow({ date: '2026-09-22', period: 'evening' }, now)).toBe(false)
    expect(isCurrentObservationWindow({ date: '2026-09-21', period: 'afternoon' }, now)).toBe(false)
  })

  it.each(['', '2026-2-01', '2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-09-22T00:00:00Z'])(
    'rejects invalid calendar date %s',
    (date) => {
      expect(isValidObservationDate(date)).toBe(false)
      expect(isPeriodAvailable(date, 'early', new Date('2026-09-22T10:00:00+08:00'))).toBe(false)
      expect(() => observationRange({ date, period: 'early' })).toThrow(RangeError)
    },
  )

  it('accepts a real leap day', () => {
    expect(isValidObservationDate('2024-02-29')).toBe(true)
  })

  it('allows past windows and only started periods today', () => {
    const now = new Date('2026-09-22T08:00:00+08:00')
    for (const { value } of SECURITY_PERIODS) {
      expect(isPeriodAvailable('2026-09-21', value, now)).toBe(true)
      expect(isPeriodAvailable('2026-09-23', value, now)).toBe(false)
    }
    expect(SECURITY_PERIODS.map(({ value }) => isPeriodAvailable('2026-09-22', value, now)))
      .toEqual([true, true, false, false])
    expect(isPeriodAvailable('2026-09-22', 'unknown' as SecurityPeriod, now)).toBe(false)
  })
})

describe('activities for a Beijing calendar day', () => {
  const activities: SecurityActivity[] = [
    { id: 'across', name: '跨天活动', startAt: '2026-09-21T18:00:00+08:00', endAt: '2026-09-23T08:00:00+08:00' },
    { id: 'same-day', name: '当日活动', startAt: '2026-09-22T09:00:00+08:00', endAt: '2026-09-22T10:00:00+08:00' },
    { id: 'ended', name: '零点结束', startAt: '2026-09-21T18:00:00+08:00', endAt: '2026-09-22T00:00:00+08:00' },
    { id: 'next-day', name: '次日开始', startAt: '2026-09-23T00:00:00+08:00', endAt: '2026-09-23T08:00:00+08:00' },
    { id: 'utc', name: 'UTC 表示的当日活动', startAt: '2026-09-21T16:00:00Z', endAt: '2026-09-21T18:00:00Z' },
  ]

  it('includes any positive overlap and excludes the exact midnight endpoints', () => {
    expect(activitiesForDate(activities, '2026-09-22').map((item) => item.id))
      .toEqual(['across', 'same-day', 'utc'])
  })

  it('returns no matches for an empty or invalid day and preserves the source', () => {
    expect(activitiesForDate(activities, '2026-10-01')).toEqual([])
    expect(activitiesForDate(activities, '2026-02-30')).toEqual([])
    expect(activities).toHaveLength(5)
  })

  it('formats timestamps in Beijing even when the source timestamps use UTC', () => {
    vi.stubEnv('TZ', 'America/New_York')
    expect(formatActivityRange(activities[4]!)).toBe('2026-09-22 00:00 – 2026-09-22 02:00')
  })
})
