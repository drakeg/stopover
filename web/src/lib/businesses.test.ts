import { describe, expect, it } from 'vitest'
import { cleanEdits, featuredAlongRoute, routeBounds, rvFacts, type Featured } from './businesses'

const biz = (id: string, lat: number, lng: number): Featured => ({
  id, name: id, lat, lng, osm_id: null, category: null, description: null, website: null, phone: null,
  max_rig_ft: null, big_rig_parking: null, hookups: null, pets: null, offer: null,
})

// A straight east-west drive along latitude 36 from -85 to -84 (~56 mi).
const route: [number, number][] = [[-85, 36], [-84.5, 36], [-84, 36]]

describe('cleanEdits', () => {
  it('blanks become null and websites get a scheme', () => {
    expect(cleanEdits({ website: ' example.com ', phone: ' ', offer: '10% off' })).toEqual({ website: 'https://example.com', phone: null, offer: '10% off' })
  })
  it('keeps http(s) urls as they are', () => {
    expect(cleanEdits({ website: 'http://a.b/c' }).website).toBe('http://a.b/c')
  })
  it('rejects silly rig lengths', () => {
    expect(() => cleanEdits({ max_rig_ft: 5 })).toThrow()
    expect(cleanEdits({ max_rig_ft: 45 }).max_rig_ft).toBe(45)
  })
})

describe('routeBounds', () => {
  it('pads the box by roughly the detour distance', () => {
    const b = routeBounds(route, 10)
    expect(b.minLat).toBeCloseTo(36 - 10 / 69, 3)
    expect(b.maxLat).toBeCloseTo(36 + 10 / 69, 3)
    expect(b.minLng).toBeLessThan(-85.17) // longitude degrees are shorter at 36°N
    expect(b.maxLng).toBeGreaterThan(-83.83)
  })
})

describe('featuredAlongRoute', () => {
  it('keeps nearby businesses in driving order and drops far ones', () => {
    const out = featuredAlongRoute([biz('east', 36.05, -84.1), biz('west', 35.97, -84.9), biz('far', 37, -84.5)], route, 10)
    expect(out.map((s) => s.business.id)).toEqual(['west', 'east'])
    expect(out[0].offRouteMi).toBeLessThan(3)
  })
  it('skips businesses that are already one of the traveler’s stops', () => {
    const out = featuredAlongRoute([biz('mine', 36.01, -84.5)], route, 10, [{ lat: 36.0105, lng: -84.5005 }])
    expect(out).toEqual([])
  })
})

describe('rvFacts', () => {
  it('lists what is known and skips the unknown', () => {
    expect(rvFacts({ max_rig_ft: 45, big_rig_parking: true, hookups: 'full', pets: null })).toEqual(['Rigs up to 45 ft', 'Big-rig parking', 'Full hookups'])
    expect(rvFacts({ max_rig_ft: null, big_rig_parking: null, hookups: null, pets: false })).toEqual(['No pets'])
  })
})
