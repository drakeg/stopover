import type { LatLng } from './geo'
import type { Fix } from './location'

/**
 * "What's near me?" from OpenStreetMap via the Overpass API — free, no key.
 * Fine for personal use; a public app should run its own Overpass instance
 * or use a paid places service (see README).
 */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

export type NearbyPlace = LatLng & {
  id: string
  name: string
  kind: string // human label, e.g. "Museum", "Waterfall"
  category: string | null // one of our CATEGORIES
  distanceMi: number
  bearing: number // degrees from north, from the user
  relative: 'ahead' | 'behind' | 'beside' | null // null when we don't know the direction of travel
  notable: boolean // has a Wikipedia/Wikidata link
}

type Tags = Record<string, string>
type Element = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Tags }

// ---------- geometry ----------
const R_MI = 3958.8
const rad = (d: number) => (d * Math.PI) / 180

export function distanceMi(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_MI * Math.asin(Math.sqrt(h))
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

export function compass(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]
}

/** Moving fast enough (≈10 mph) for the heading to mean something. */
export const isMoving = (fix: Fix) => fix.heading !== null && (fix.speed ?? 0) > 4.5

// ---------- what counts as a place worth a stop ----------
const KINDS: Record<string, Record<string, [label: string, category: string | null]>> = {
  tourism: {
    attraction: ['Attraction', 'Roadside attraction'], museum: ['Museum', 'Museum'], gallery: ['Gallery', 'Museum'],
    viewpoint: ['Viewpoint', 'Scenic view'], zoo: ['Zoo', 'Roadside attraction'], aquarium: ['Aquarium', 'Roadside attraction'],
    theme_park: ['Theme park', 'Roadside attraction'], camp_site: ['Campground', 'Campground'],
    caravan_site: ['RV park', 'Campground'], picnic_site: ['Picnic area', 'Scenic view'], information: ['Visitor center', null],
  },
  historic: {
    _: ['Historic site', 'Historic site'], battlefield: ['Battlefield', 'Historic site'], fort: ['Fort', 'Historic site'],
    monument: ['Monument', 'Historic site'], memorial: ['Memorial', 'Historic site'], ruins: ['Ruins', 'Historic site'],
    archaeological_site: ['Archaeological site', 'Historic site'], house: ['Historic house', 'Historic site'],
    ship: ['Historic ship', 'Historic site'], mine: ['Historic mine', 'Historic site'], district: ['Historic district', 'Historic site'],
  },
  boundary: { protected_area: ['Park / protected area', 'National / state park'], national_park: ['National park', 'National / state park'] },
  leisure: { nature_reserve: ['Nature reserve', 'National / state park'], park: ['Park', 'National / state park'] },
  natural: {
    waterfall: ['Waterfall', 'Scenic view'], cave_entrance: ['Cave', 'Roadside attraction'], peak: ['Peak', 'Scenic view'],
    arch: ['Natural arch', 'Scenic view'], spring: ['Spring', 'Scenic view'], hot_spring: ['Hot spring', 'Scenic view'],
  },
  waterway: { waterfall: ['Waterfall', 'Scenic view'] },
}

export function classify(tags: Tags): { kind: string; category: string | null } | null {
  for (const key of Object.keys(KINDS)) {
    const v = tags[key]
    if (!v) continue
    const hit = KINDS[key][v] ?? KINDS[key]._
    if (hit) return { kind: hit[0], category: hit[1] }
  }
  return null
}

// Small markers that would crowd out the things a road sign points to
const MINOR_HISTORIC = 'memorial|wayside_cross|wayside_shrine|boundary_stone|milestone|marker|tomb|grave|cannon|charcoal_pile|stone'

/** Places worth a stop within `radiusKm`. */
export function nearbyQuery(at: LatLng, radiusKm: number): string {
  const a = `(around:${Math.round(radiusKm * 1000)},${at.lat.toFixed(5)},${at.lng.toFixed(5)})`
  return `[out:json][timeout:20];
(
  nwr${a}["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park|camp_site|caravan_site)$"]["name"];
  nwr${a}["tourism"="information"]["information"="office"]["name"];
  nwr${a}["historic"]["historic"!~"^(${MINOR_HISTORIC})$"]["name"];
  nwr${a}["historic"="memorial"]["memorial"!~"^(plaque|blue_plaque|stone|bench|ghost_bike|cross)$"]["wikidata"]["name"];
  nwr${a}["boundary"~"^(protected_area|national_park)$"]["name"];
  nwr${a}["leisure"="nature_reserve"]["name"];
  nwr${a}["leisure"="park"]["wikidata"]["name"];
  nwr${a}["natural"~"^(waterfall|cave_entrance|arch|hot_spring)$"]["name"];
  nwr${a}["waterway"="waterfall"]["name"];
);
out tags center qt 400;`
}

/** Any named feature matching the typed words within `radiusKm` (catches things the category list leaves out). */
export function nameQuery(at: LatLng, radiusKm: number, text: string): string | null {
  const words = searchWords(text)
  if (!words.length) return null
  const a = `(around:${Math.round(radiusKm * 1000)},${at.lat.toFixed(5)},${at.lng.toFixed(5)})`
  // Words are letters/digits only (see searchWords), so they're safe inside the regex and the string.
  return `[out:json][timeout:20];
nwr${a}["name"~"${words.join('.*')}",i][!"highway"][!"building:part"];
out tags center qt 60;`
}

/** Letters and digits only; drops filler words road signs use, and exit/mile numbers. */
export function searchWords(text: string): string[] {
  const filler = new Set(['the', 'of', 'and', 'at', 'exit', 'next', 'right', 'left', 'mile', 'miles', 'mi', 'ahead'])
  const counters = new Set(['exit', 'mile', 'miles', 'mi'])
  const tokens = text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  const out: string[] = []
  tokens.forEach((w, i) => {
    const isNum = /^\d+$/.test(w)
    if (isNum && (counters.has(tokens[i - 1]) || counters.has(tokens[i + 1]))) return // "exit 356", "5 miles"
    if (!isNum && (w.length < 2 || filler.has(w))) return
    out.push(w)
  })
  return out.slice(0, 5)
}

// ---------- parsing and ranking ----------
export function parseElements(elements: Element[], from: Fix, requireKnownKind = true): NearbyPlace[] {
  const moving = isMoving(from)
  const seen = new Set<string>()
  const out: NearbyPlace[] = []
  for (const el of elements) {
    const tags = el.tags ?? {}
    const name = tags.name?.trim()
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (!name || lat === undefined || lng === undefined) continue
    const cls = classify(tags)
    if (!cls && requireKnownKind) continue
    const key = name.toLowerCase()
    const p = { lat, lng }
    const dist = distanceMi(from, p)
    // Same name close together = the same place mapped twice (e.g. a park's boundary and its sign)
    if (seen.has(key) && out.some((o) => o.name.toLowerCase() === key && distanceMi(o, p) < 2)) continue
    seen.add(key)
    const bearing = bearingDeg(from, p)
    const diff = moving ? angleDiff(bearing, from.heading!) : null
    out.push({
      id: `${el.type}/${el.id}`,
      name,
      kind: cls?.kind ?? prettyKind(tags),
      category: cls?.category ?? null,
      lat, lng,
      distanceMi: dist,
      bearing,
      relative: diff === null ? null : diff <= 60 ? 'ahead' : diff >= 120 ? 'behind' : 'beside',
      notable: Boolean(tags.wikidata || tags.wikipedia),
    })
  }
  return out
}

function prettyKind(tags: Tags): string {
  for (const k of ['amenity', 'shop', 'tourism', 'leisure', 'historic', 'natural', 'building']) {
    if (tags[k] && tags[k] !== 'yes') return tags[k].replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  }
  return 'Place'
}

/**
 * Best first: close, notable, and ahead of you (signs advertise what's coming up,
 * not what you've just passed). Behind you still shows, just lower down.
 */
export function rank(places: NearbyPlace[]): NearbyPlace[] {
  const score = (p: NearbyPlace) => {
    let s = p.distanceMi + 0.5
    if (p.relative === 'behind') s *= 3
    else if (p.relative === 'beside') s *= 1.4
    if (p.notable) s *= 0.5
    if (p.kind === 'Park' || p.kind === 'Visitor center') s *= 1.3
    return s
  }
  return [...places].sort((a, b) => score(a) - score(b))
}

/** Keep places whose name contains every typed word (accent/case-insensitive). */
export function matchName(places: NearbyPlace[], text: string): NearbyPlace[] {
  const words = searchWords(text)
  if (!words.length) return places
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return places.filter((p) => {
    const n = norm(p.name)
    return words.every((w) => n.includes(w))
  })
}

// ---------- network ----------
async function overpass(query: string, signal?: AbortSignal): Promise<Element[]> {
  let lastErr: unknown
  for (const url of OVERPASS) {
    try {
      // Form-encoded POST is a "simple" CORS request: no preflight round trip.
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal,
      })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      const data = await res.json()
      return data.elements ?? []
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      lastErr = e
    }
  }
  throw lastErr
}

export const NEARBY_RADIUS_MI = 25

export async function findNearby(fix: Fix, signal?: AbortSignal): Promise<NearbyPlace[]> {
  const els = await overpass(nearbyQuery(fix, NEARBY_RADIUS_MI * 1.609), signal)
  return rank(parseElements(els, fix))
}

export async function findByName(fix: Fix, text: string, radiusMi = 50, signal?: AbortSignal): Promise<NearbyPlace[]> {
  const q = nameQuery(fix, radiusMi * 1.609, text)
  if (!q) return []
  const els = await overpass(q, signal)
  return rank(parseElements(els, fix, false))
}
