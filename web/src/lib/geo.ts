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

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180

/**
 * Pulls coordinates out of pasted text: "36.01, -84.27", or a Google / Apple
 * Maps link (…/@36.01,-84.27,15z, ?q=36.01,-84.27, ?ll=…, !3d36.01!4d-84.27).
 */
export function parseCoordinates(text: string): LatLng | null {
  const t = decodeURIComponent(text.trim())
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`
  const patterns = [
    new RegExp(String.raw`!3d${num}!4d${num}`), // Google place pin (most precise)
    new RegExp(String.raw`@${num},\s*${num}`), // Google map view
    new RegExp(String.raw`[?&](?:q|ll|query|daddr|destination|sll)=${num},\s*${num}`),
    new RegExp(String.raw`^${num}\s*[,\s]\s*${num}$`), // bare "lat, lng"
  ]
  for (const re of patterns) {
    const m = t.match(re)
    if (m && valid(+m[1], +m[2])) return { lat: +m[1], lng: +m[2] }
  }
  return null
}

const SHORT_LINK = /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i

// Photon (OSM-based, typo-tolerant, good at landmarks) — tried alongside Nominatim
const PHOTON = 'https://photon.komoot.io/api'

type PhotonFeature = {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string; housenumber?: string; street?: string; city?: string; county?: string
    state?: string; countrycode?: string; country?: string
  }
}

async function photon(q: string, near?: LatLng): Promise<Located[]> {
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : ''
  const res = await fetch(`${PHOTON}/?limit=8&lang=en&q=${encodeURIComponent(q)}${bias}`)
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const data: { features: PhotonFeature[] } = await res.json()
  return data.features
    .filter((f) => ['US', 'CA'].includes((f.properties.countrycode ?? '').toUpperCase()))
    .map((f) => {
      const p = f.properties
      const street = [p.housenumber, p.street].filter(Boolean).join(' ')
      const label = [...new Set([p.name, street, p.city, p.county, p.state])].filter(Boolean).join(', ')
      return { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label }
    })
}

async function nominatim(q: string): Promise<Located[]> {
  const res = await fetch(
    `${NOMINATIM}/search?format=jsonv2&limit=6&countrycodes=us,ca&q=${encodeURIComponent(q)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const data: NominatimResult[] = await res.json()
  return data.map((r) => ({ lat: +r.lat, lng: +r.lon, label: r.display_name }))
}

/** Merge result lists, dropping near-duplicates (within ~150 m). */
export function mergeResults(...lists: Located[][]): Located[] {
  const out: Located[] = []
  for (const r of lists.flat()) {
    if (!out.some((o) => Math.abs(o.lat - r.lat) < 0.0015 && Math.abs(o.lng - r.lng) < 0.0015)) out.push(r)
  }
  return out.slice(0, 8)
}

export async function searchPlaces(query: string, near?: LatLng): Promise<Located[]> {
  const q = query.trim()
  if (!q) return []
  const coords = parseCoordinates(q)
  if (coords) return [{ ...coords, label: `Pinned location (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})` }]
  if (SHORT_LINK.test(q))
    throw new Error('Short share links can’t be read. Open the link, then copy the full address-bar URL or the coordinates.')

  const [a, b] = await Promise.allSettled([photon(q, near), nominatim(q)])
  if (a.status === 'rejected' && b.status === 'rejected') throw new Error('Search is unavailable right now. Try again, or pick on the map.')
  return mergeResults(a.status === 'fulfilled' ? a.value : [], b.status === 'fulfilled' ? b.value : [])
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
