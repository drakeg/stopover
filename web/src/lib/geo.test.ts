import { describe, expect, it } from 'vitest'
import { stopsAlongRoute } from './geo'
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
