import { describe, expect, it } from 'vitest'
import { findDuplicates, nameSimilarity } from './duplicates'
import type { Place } from './supabase'

let n = 0
const place = (name: string, lat: number, lng: number, o: Partial<Place> = {}): Place => ({
  id: `p${++n}`, user_id: 'u', list_id: 'L', name, lat, lng, notes: null, category: null, address: null, url: null,
  near: null, approximate: false, osm_id: null, city: null, state: null, country: 'US', visited: false, visited_at: null,
  created_at: '', ...o,
})

const k25 = place('K-25 History Center', 35.9303, -84.394, { osm_id: 'node/2' })
const museum = place("Children's Museum of Oak Ridge", 35.9312, -84.3936)
const lostSea = place('The Lost Sea Adventure', 35.53, -84.45, { visited: true })
const roadPin = place('Manhattan Project Historic Site', 35.88, -84.51, { approximate: true }) // saved from I-40
const existing = [k25, museum, lostSea, roadPin]
const names = (c: Parameters<typeof findDuplicates>[0]) => findDuplicates(c, existing).map((h) => h.place.name)

describe('nameSimilarity', () => {
  it('scores near-identical names high and different names low', () => {
    expect(nameSimilarity('K-25 History Center', 'K25 History Center (NPS)')).toBeGreaterThan(0.5)
    expect(nameSimilarity('K-25 History Center', "Children's Museum of Oak Ridge")).toBeLessThan(0.15)
  })
})

describe('findDuplicates', () => {
  it('same OpenStreetMap feature, whatever the name', () => {
    expect(names({ name: 'K25', lat: 35.93, lng: -84.39, osm_id: 'node/2' })).toEqual(['K-25 History Center'])
  })

  it('similar name nearby, including places already visited', () => {
    expect(names({ name: 'K-25 History Center', lat: 35.931, lng: -84.392 })).toEqual(['K-25 History Center'])
    expect(names({ name: 'Lost Sea', lat: 35.531, lng: -84.451 })).toEqual(['The Lost Sea Adventure'])
  })

  it("doesn't confuse neighbours with different names", () => {
    expect(names({ name: 'American Museum of Science and Energy', lat: 35.931, lng: -84.3937 })).toEqual([])
  })

  it('a quick add from the road matches the real place miles away by name', () => {
    expect(names({ name: 'Lost Sea Adventure', lat: 35.70, lng: -84.40, approximate: true })).toEqual(['The Lost Sea Adventure'])
    // …and the reverse: fixing the pin of something already saved from the road
    expect(names({ name: 'Manhattan Project Historic Site', lat: 35.93, lng: -84.31 })).toEqual(['Manhattan Project Historic Site'])
  })

  it('same name far away is a different place', () => {
    expect(names({ name: 'K-25 History Center', lat: 37.5, lng: -84.39 })).toEqual([])
  })

  it('exactly the same spot with some name overlap', () => {
    expect(names({ name: 'K-25 Center', lat: 35.9303, lng: -84.394 })).toEqual(['K-25 History Center'])
  })
})
