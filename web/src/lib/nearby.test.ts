import { describe, expect, it } from 'vitest'
import { bearingDeg, classify, compass, distanceMi, matchName, nameQuery, nearbyQuery, parseElements, rank, searchWords } from './nearby'

// Driving east on I-40 near Kingston, TN
const eastbound = { lat: 35.88, lng: -84.51, heading: 70, speed: 30 }
const parked = { ...eastbound, heading: null, speed: 0 }

const el = (id: number, name: string, lat: number, lon: number, tags: Record<string, string>) =>
  ({ type: 'node', id, lat, lon, tags: { name, ...tags } })

const elements = [
  el(1, 'American Museum of Science and Energy', 36.02, -84.26, { tourism: 'museum', wikidata: 'Q1' }), // ahead, notable
  el(2, 'K-25 History Center', 35.93, -84.39, { tourism: 'museum' }), // ahead, close
  el(3, 'Kingston City Park', 35.87, -84.53, { leisure: 'park', wikidata: 'Q9' }), // basically here
  el(4, 'Rockwood Mine', 35.86, -84.69, { historic: 'mine' }), // behind
  el(5, 'Some Gas Station', 35.89, -84.5, { amenity: 'fuel' }), // not a stop
  { type: 'way', id: 6, center: { lat: 35.95, lon: -84.3 }, tags: { name: 'Clinch River Overlook', tourism: 'viewpoint' } },
  el(7, 'K-25 History Center', 35.931, -84.391, { tourism: 'attraction' }), // duplicate mapping
]

describe('geometry', () => {
  it('measures miles and compass direction', () => {
    expect(distanceMi({ lat: 36.16, lng: -86.78 }, { lat: 35.96, lng: -83.92 })).toBeGreaterThan(155)
    expect(distanceMi({ lat: 36.16, lng: -86.78 }, { lat: 35.96, lng: -83.92 })).toBeLessThan(165)
    expect(compass(bearingDeg({ lat: 36, lng: -85 }, { lat: 36, lng: -84 }))).toBe('E')
    expect(compass(bearingDeg({ lat: 36, lng: -85 }, { lat: 37, lng: -85 }))).toBe('N')
  })
})

describe('classify', () => {
  it('maps OSM tags to our types and skips everyday places', () => {
    expect(classify({ tourism: 'museum' })).toEqual({ kind: 'Museum', category: 'Museum' })
    expect(classify({ historic: 'castle' })).toEqual({ kind: 'Historic site', category: 'Historic site' })
    expect(classify({ natural: 'waterfall' })?.category).toBe('Scenic view')
    expect(classify({ amenity: 'fuel' })).toBeNull()
  })
})

describe('parseElements + rank', () => {
  it('drops non-stops and duplicates, reads way centers, tags ahead/behind', () => {
    const got = parseElements(elements, eastbound)
    expect(got.map((p) => p.name).sort()).toEqual([
      'American Museum of Science and Energy', 'Clinch River Overlook', 'K-25 History Center', 'Kingston City Park', 'Rockwood Mine',
    ])
    expect(got.find((p) => p.name === 'Rockwood Mine')?.relative).toBe('behind')
    expect(got.find((p) => p.name === 'K-25 History Center')?.relative).toBe('ahead')
  })

  it('ranks things ahead above similar things behind', () => {
    const names = rank(parseElements(elements, eastbound)).map((p) => p.name)
    expect(names.indexOf('K-25 History Center')).toBeLessThan(names.indexOf('Rockwood Mine'))
    expect(names[names.length - 1]).toBe('Rockwood Mine')
  })

  it('without a heading (parked), ranks by distance and notability only', () => {
    const got = parseElements(elements, parked)
    expect(got.every((p) => p.relative === null)).toBe(true)
    expect(rank(got)[0].name).toBe('Kingston City Park')
  })
})

describe('searching by what the sign said', () => {
  it('pulls usable words out of sign text', () => {
    expect(searchWords('The K-25 History Center — Exit 356, next right')).toEqual(['25', 'history', 'center'])
    expect(searchWords('Route 66 Museum 5 miles')).toEqual(['route', '66', 'museum'])
    expect(searchWords("Science & Energy Museum's")).toEqual(['science', 'energy', 'museum'])
  })

  it('filters nearby results by the typed words', () => {
    const got = parseElements(elements, eastbound)
    expect(matchName(got, 'history center').map((p) => p.name)).toEqual(['K-25 History Center'])
    expect(matchName(got, 'museum energy').map((p) => p.name)).toEqual(['American Museum of Science and Energy'])
  })

  it('builds queries with safe, letters-only regex', () => {
    expect(nameQuery(eastbound, 80, 'Lost "Sea" (Adventure)!')).toContain('["name"~"lost.*sea.*adventure",i]')
    expect(nameQuery(eastbound, 80, '!!!')).toBeNull()
    expect(nearbyQuery(eastbound, 40)).toContain('(around:40000,35.88000,-84.51000)')
  })
})
