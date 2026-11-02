import { lineString, point } from '@turf/helpers'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import type { Place } from './supabase'

export type LatLng = { lat: number; lng: number }
export type Located = LatLng & { label: string }

export const KM_PER_MI = 1.609344

// ---------- Geocoding (OpenStreetMap Nominatim) ----------
// Free, no key. Usage policy: max ~1 request/second, so we only search on submit.
// Swap these two functions to move to a paid provider later.
const NOMINATIM = 'https://nominatim.openstreetmap.org'

type NominatimResult = { lat: string; lon: string; display_name: string; name?: string }

export async function searchPlaces(query: string): Promise<Located[]> {
  const q = query.trim()
  if (!q) return []
  const res = await fetch(
    `${NOMINATIM}/search?format=jsonv2&limit=6&countrycodes=us,ca&q=${encodeURIComponent(q)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data: NominatimResult[] = await res.json()
  return data.map((r) => ({ lat: +r.lat, lng: +r.lon, label: r.display_name }))
}

export async function reverseGeocode(p: LatLng): Promise<{ name: string; address: string } | null> {
  const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=17&lat=${p.lat}&lon=${p.lng}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null
  const r: NominatimResult = await res.json()
  if (!r?.display_name) return null
  return { name: r.name || r.display_name.split(',')[0], address: r.display_name }
}

// ---------- Routing (OSRM) ----------
// The public demo server is fine for personal use; see README for production options.
const OSRM = 'https://router.project-osrm.org'

export type Route = {
  coords: [number, number][] // [lng, lat] pairs, GeoJSON order
  distanceMi: number
  durationMin: number
}

export async function getRoute(from: LatLng, to: LatLng): Promise<Route> {
  const url = `${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Routing failed (${res.status})`)
  const data = await res.json()
  const r = data.routes?.[0]
  if (!r) throw new Error('No driving route found between those points')
  return {
    coords: r.geometry.coordinates,
    distanceMi: r.distance / 1000 / KM_PER_MI,
    durationMin: r.duration / 60,
  }
}

// ---------- Stops along a route ----------
export type Stop = {
  place: Place
  offRouteMi: number // straight-line distance from the closest point on the route
  milesFromStart: number // how far along the route that closest point is
}

/**
 * Returns saved places within `maxDetourMi` of the route, ordered by where
 * they fall along the drive. Visited places are excluded unless asked for.
 */
export function stopsAlongRoute(
  places: Place[],
  routeCoords: [number, number][],
  maxDetourMi: number,
  includeVisited = false,
): Stop[] {
  if (routeCoords.length < 2) return []
  const line = lineString(routeCoords)
  const stops: Stop[] = []
  for (const place of places) {
    if (place.visited && !includeVisited) continue
    const nearest = nearestPointOnLine(line, point([place.lng, place.lat]), { units: 'miles' })
    const off = nearest.properties.dist ?? Infinity
    if (off <= maxDetourMi) {
      stops.push({ place, offRouteMi: off, milesFromStart: nearest.properties.location ?? 0 })
    }
  }
  return stops.sort((a, b) => a.milesFromStart - b.milesFromStart)
}

// ---------- Hand-off to navigation apps ----------
export function directionsUrl(to: LatLng, label?: string): string {
  const isApple = /iPhone|iPad|Macintosh/.test(navigator.userAgent)
  return isApple
    ? `https://maps.apple.com/?daddr=${to.lat},${to.lng}${label ? `&q=${encodeURIComponent(label)}` : ''}`
    : `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`
}

export function formatMiles(mi: number): string {
  return mi < 10 ? mi.toFixed(1) : Math.round(mi).toLocaleString()
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h} hr ${m} min` : `${m} min`
}
