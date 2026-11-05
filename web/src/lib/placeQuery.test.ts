import { describe, expect, it } from 'vitest'
import { localityFrom } from './geo'
import { EMPTY_QUERY, queryPlaces, regionOptions } from './placeQuery'
import type { Place } from './supabase'

let n = 0
const mk = (o: Partial<Place>): Place => ({
  id: String(++n), user_id: 'u', name: 'x', lat: 0, lng: 0, notes: null, category: null, address: null, url: null,
  near: null, approximate: false, list_id: 'L', osm_id: null, city: null, state: null, country: 'US', visited: false, visited_at: null,
  created_at: `2026-11-0${n}`, ...o,
})

const places = [
  mk({ name: 'Manhattan Project Historic Site', city: 'Oak Ridge', state: 'TN', category: 'Historic site', near: 'I-40 exit 356' }),
  mk({ name: 'Burgess Falls', city: 'Sparta', state: 'TN', category: 'National / state park', visited: true }),
  mk({ name: 'Joshua Tree', city: 'Twentynine Palms', state: 'CA', category: 'National / state park' }),
  mk({ name: 'Niagara Parks', city: 'Niagara Falls', state: 'ON', country: 'CA', approximate: true, notes: 'Café near the falls' }),
  mk({ name: 'Mystery spot' }),
]
const names = (ps: Place[]) => ps.map((p) => p.name)

describe('queryPlaces', () => {
  it('searches name, notes, city, state name and road notes, ignoring accents and case', () => {
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, text: 'exit 356' }))).toEqual(['Manhattan Project Historic Site'])
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, text: 'cafe' }))).toEqual(['Niagara Parks'])
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, text: 'tennessee falls' }))).toEqual(['Burgess Falls'])
  })

  it('keeps California and Canada apart', () => {
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, region: 'CA' }))).toEqual(['Joshua Tree'])
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, region: 'CA-ON' }))).toEqual(['Niagara Parks'])
  })

  it('filters by type, status and approximate', () => {
    expect(queryPlaces(places, { ...EMPTY_QUERY, category: 'National / state park' })).toHaveLength(2)
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, status: 'visited' }))).toEqual(['Burgess Falls'])
    expect(queryPlaces(places, { ...EMPTY_QUERY, status: 'to-visit' })).toHaveLength(4)
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, approximateOnly: true }))).toEqual(['Niagara Parks'])
  })

  it('sorts by state name then city, unknown state last', () => {
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, sort: 'state' }))).toEqual([
      'Joshua Tree', 'Niagara Parks', 'Manhattan Project Historic Site', 'Burgess Falls', 'Mystery spot',
    ])
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, sort: 'newest' }))[0]).toBe('Mystery spot')
    expect(names(queryPlaces(places, { ...EMPTY_QUERY, sort: 'name' }))[0]).toBe('Burgess Falls')
  })

  it('lists states with counts, A–Z by name', () => {
    expect(regionOptions(places)).toEqual([
      { key: 'CA', label: 'California', count: 1 },
      { key: 'CA-ON', label: 'Ontario', count: 1 },
      { key: 'TN', label: 'Tennessee', count: 2 },
    ])
  })
})

describe('localityFrom', () => {
  it('reads Nominatim address details', () => {
    expect(localityFrom({ town: 'Oak Ridge', state: 'Tennessee', 'ISO3166-2-lvl4': 'US-TN', country_code: 'us' }))
      .toEqual({ city: 'Oak Ridge', state: 'TN', country: 'US' })
    expect(localityFrom({})).toEqual({ city: null, state: null, country: null })
  })
})
