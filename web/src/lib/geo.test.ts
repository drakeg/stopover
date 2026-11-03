import { describe, expect, it } from 'vitest'
import { directionsUrl, mergeResults, tripLinks, parseCoordinates, stopsAlongRoute } from './geo'
import type { Place } from './supabase'

const place = (name: string, lat: number, lng: number, visited = false): Place => ({
  id: name, user_id: 'u', name, lat, lng, visited,
  notes: null, category: null, address: null, url: null, near: null, approximate: false, list_id: 'L', city: null, state: null, country: null, visited_at: null, created_at: '',
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

describe('directionsUrl', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
  const android = 'Mozilla/5.0 (Linux; Android 15)'
  const exact = { lat: 36.01, lng: -84.27, name: 'K-25 Overlook' }
  const rough = { ...exact, name: 'Manhattan Project Historic Site', approximate: true,
    address: 'Interstate 40, Kingston, Roane County, Tennessee, 37763, United States' }

  it('gives directions to exact pins', () => {
    expect(directionsUrl(exact, iphone)).toBe('https://maps.apple.com/directions?destination=36.01,-84.27&mode=driving')
    expect(directionsUrl(exact, android)).toContain('google.com/maps/dir/?api=1&destination=36.01,-84.27')
  })

  it('searches by name near approximate pins', () => {
    expect(directionsUrl(rough, iphone)).toBe(
      'https://maps.apple.com/search?query=Manhattan%20Project%20Historic%20Site&center=36.01,-84.27')
    expect(decodeURIComponent(directionsUrl(rough, android))).toContain(
      'query=Manhattan Project Historic Site near Roane County, Tennessee')
  })
})

describe('tripLinks', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
  const android = 'Mozilla/5.0 (Linux; Android 15)'
  const nash = { lat: 36.16, lng: -86.78 }
  const knox = { lat: 35.96, lng: -83.92 }
  const stop = (n: number) => ({ lat: 36 + n / 100, lng: -85 - n / 100, name: `Stop ${n}` })

  it('puts start, stops and destination in one Apple Maps link', () => {
    const [leg] = tripLinks(nash, [stop(1), stop(2)], knox, 'apple', iphone)
    expect(leg.url).toBe('https://maps.apple.com/directions?source=36.16,-86.78&destination=35.96,-83.92' +
      '&waypoint=36.01,-85.01&waypoint=36.02,-85.02&mode=driving')
  })

  it('builds the Google Maps equivalent', () => {
    const [leg] = tripLinks(nash, [stop(1), stop(2)], knox, 'google', android)
    expect(leg.url).toBe('https://www.google.com/maps/dir/?api=1&origin=36.16,-86.78&destination=35.96,-83.92' +
      '&waypoints=36.01,-85.01%7C36.02,-85.02&travelmode=driving')
  })

  it('works with no stops', () => {
    expect(tripLinks(nash, [], knox, 'google', android)).toHaveLength(1)
  })

  it('keeps up to 9 stops in one Google link on a computer', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15'
    expect(tripLinks(nash, [1, 2, 3, 4, 5].map(stop), knox, 'google', mac)).toHaveLength(1)
  })

  it('splits long trips into legs that join up', () => {
    const legs = tripLinks(nash, [1, 2, 3, 4, 5].map(stop), knox, 'google', android)
    expect(legs.map((l) => l.label)).toEqual(['Start → Stop 4', 'Stop 4 → Destination'])
    expect(legs[0].url).toContain('waypoints=36.01,-85.01%7C36.02,-85.02%7C36.03,-85.03')
    expect(legs[1].url).toContain('origin=36.04,-85.04&destination=35.96,-83.92&waypoints=36.05,-85.05&')
  })
})
