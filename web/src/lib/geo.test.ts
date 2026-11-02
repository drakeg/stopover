import { describe, expect, it } from 'vitest'
import { mergeResults, parseCoordinates, stopsAlongRoute } from './geo'
import type { Place } from './supabase'

const place = (name: string, lat: number, lng: number, visited = false): Place => ({
  id: name, user_id: 'u', name, lat, lng, visited,
  notes: null, category: null, address: null, url: null, visited_at: null, created_at: '',
})

// Rough I-40 line: Nashville -> Knoxville
const route: [number, number][] = [
  [-86.78, 36.16], // Nashville
  [-85.5, 36.16],  // Cookeville
  [-84.5, 35.95],
  [-83.92, 35.96], // Knoxville
]

describe('stopsAlongRoute', () => {
  const places = [
    place('Oak Ridge (Manhattan Project)', 36.01, -84.27),
    place('Cookeville stop', 36.17, -85.5),
    place('Memphis (far away)', 35.15, -90.05),
    place('Already visited', 36.0, -84.6, true),
  ]

  it('keeps nearby places, drops far ones, orders by trip progress', () => {
    const stops = stopsAlongRoute(places, route, 25)
    expect(stops.map((s) => s.place.name)).toEqual(['Cookeville stop', 'Oak Ridge (Manhattan Project)'])
    expect(stops[0].milesFromStart).toBeLessThan(stops[1].milesFromStart)
    expect(stops[1].offRouteMi).toBeLessThan(10)
  })

  it('respects the detour limit', () => {
    expect(stopsAlongRoute(places, route, 1).map((s) => s.place.name)).toEqual(['Cookeville stop'])
  })

  it('can include visited places', () => {
    expect(stopsAlongRoute(places, route, 25, true)).toHaveLength(3)
  })
})


describe('parseCoordinates', () => {
  it.each([
    ['36.0104, -84.2696', 36.0104, -84.2696],
    ['36.0104 -84.2696', 36.0104, -84.2696],
    ['https://www.google.com/maps/place/K-25/@36.0102,-84.3897,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d36.0119!4d-84.3889', 36.0119, -84.3889],
    ['https://www.google.com/maps/@36.0102,-84.3897,15z', 36.0102, -84.3897],
    ['https://www.google.com/maps/search/?api=1&query=36.01,-84.27', 36.01, -84.27],
    ['https://maps.apple.com/?ll=36.01,-84.27&q=Oak%20Ridge', 36.01, -84.27],
  ])('reads %s', (text, lat, lng) => {
    expect(parseCoordinates(text)).toEqual({ lat, lng })
  })

  it('ignores ordinary searches and impossible numbers', () => {
    expect(parseCoordinates('Manhattan Project Oak Ridge TN')).toBeNull()
    expect(parseCoordinates('I-40 exit 356')).toBeNull()
    expect(parseCoordinates('136.0, -84.2')).toBeNull()
  })
})

describe('mergeResults', () => {
  it('drops near-duplicates across services', () => {
    const a = [{ lat: 36.0, lng: -84.0, label: 'A' }]
    const b = [{ lat: 36.0005, lng: -84.0005, label: 'A dup' }, { lat: 35, lng: -85, label: 'B' }]
    expect(mergeResults(a, b).map((r) => r.label)).toEqual(['A', 'B'])
  })
})
