import { describe, expect, it } from 'vitest'
import { placesToCsv, placesToGpx } from './exporters'
import type { Place } from './supabase'

const p: Place = {
  id: '1', user_id: 'u', name: 'Rock & Roll <Museum>', near: 'I-40 exit 356', category: 'Museum',
  notes: 'Big lot, "RV friendly", ok', address: 'Oak Ridge, TN', lat: 36.0104, lng: -84.2696, url: null,
  approximate: false, visited: false, visited_at: null, created_at: '2026-11-02',
}

describe('placesToGpx', () => {
  it('writes an escaped waypoint', () => {
    const g = placesToGpx([p])
    expect(g).toContain('<wpt lat="36.0104" lon="-84.2696">')
    expect(g).toContain('<name>Rock &amp; Roll &lt;Museum&gt;</name>')
    expect(g).toContain('&quot;RV friendly&quot;')
  })
})

describe('placesToCsv', () => {
  it('quotes commas and quotes, keeps negatives as numbers', () => {
    const [head, row] = placesToCsv([p]).trim().split('\r\n')
    expect(head.startsWith('name,near,category')).toBe(true)
    expect(row).toContain('"Big lot, ""RV friendly"", ok"')
    expect(row).toContain(',-84.2696,')
  })
  it('stops spreadsheet formulas', () => {
    expect(placesToCsv([{ ...p, name: '=HYPERLINK("x")' }])).toContain(`"'=HYPERLINK(""x"")"`)
  })
})
