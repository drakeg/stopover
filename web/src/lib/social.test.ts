import { describe, expect, it } from 'vitest'
import { dayBounds, whenLabel } from './social'

describe('whenLabel', () => {
  const now = new Date('2026-11-05T15:00:00')
  it('describes check-ins in plain words', () => {
    expect(whenLabel({ kind: 'here', visit_date: null, starts_at: new Date('2026-11-05T14:59:30').toISOString(), ends_at: '' }, now)).toBe('here now · just arrived')
    expect(whenLabel({ kind: 'here', visit_date: null, starts_at: new Date('2026-11-05T13:05:00').toISOString(), ends_at: '' }, now)).toMatch(/^here now · since 1:05/)
    expect(whenLabel({ kind: 'going', visit_date: '2026-11-05', starts_at: '', ends_at: '' }, now)).toBe('going today')
    expect(whenLabel({ kind: 'going', visit_date: '2026-11-06', starts_at: '', ends_at: '' }, now)).toBe('going tomorrow')
    expect(whenLabel({ kind: 'going', visit_date: '2026-11-08', starts_at: '', ends_at: '' }, now)).toMatch(/^going Sun/)
  })
})

describe('dayBounds', () => {
  it('covers the whole local day', () => {
    const { starts_at, ends_at } = dayBounds('2026-11-08')
    expect(new Date(starts_at).getDate()).toBe(8)
    expect(new Date(ends_at).getTime() - new Date(starts_at).getTime()).toBe(86399000)
  })
})
