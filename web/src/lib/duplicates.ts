import { distanceMi } from './nearby'
import { supabase, type Place } from './supabase'

/**
 * "Haven't we already saved this?" — checked before adding a place.
 * Mirrors the server's same-place rule, plus a looser rule for quick adds
 * (whose pin is where you were on the road, not the place itself).
 */

export type Candidate = { name: string; lat: number; lng: number; osm_id?: string | null; approximate?: boolean }

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()

const STOP = new Set(['the', 'of', 'and', 'at', 'a', 'an'])

/** Trigram similarity (like Postgres pg_trgm), 0–1. */
export function nameSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const out = new Set<string>()
    for (const w of norm(s).split(' ').filter(Boolean)) {
      const p = `  ${w} `
      for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3))
    }
    return out
  }
  const A = grams(a), B = grams(b)
  if (!A.size || !B.size) return 0
  let common = 0
  for (const g of A) if (B.has(g)) common++
  return common / (A.size + B.size - common)
}

/** One name's meaningful words all appear in the other ("Lost Sea" ⊂ "The Lost Sea Adventure"). */
function contains(a: string, b: string): boolean {
  const wa = norm(a).split(' ').filter((w) => w && !STOP.has(w))
  const wb = new Set(norm(b).split(' ').filter((w) => w && !STOP.has(w)))
  return wa.length >= 2 && wa.every((w) => wb.has(w))
}

export type DuplicateHit = { place: Place; distanceMi: number; reason: 'same-feature' | 'same-name' | 'same-spot' }

export function findDuplicates(c: Candidate, existing: Place[]): DuplicateHit[] {
  const hits: DuplicateHit[] = []
  for (const p of existing) {
    const d = distanceMi(c, p)
    const roughPins = c.approximate || p.approximate
    const sim = nameSimilarity(c.name, p.name)
    const similarName = sim >= 0.5 || contains(c.name, p.name) || contains(p.name, c.name)
    let reason: DuplicateHit['reason'] | null = null
    if (c.osm_id && p.osm_id && c.osm_id === p.osm_id) reason = 'same-feature'
    // A sign can be miles from the place; allow more distance when either pin came from the road
    else if (similarName && d <= (roughPins ? 30 : 2)) reason = 'same-name'
    else if (!roughPins && d <= 0.05 && sim >= 0.2) reason = 'same-spot'
    if (reason) hits.push({ place: p, distanceMi: d, reason })
  }
  return hits.sort((a, b) => a.distanceMi - b.distanceMi)
}

/** Every place in any of the user's lists within ~30 miles (row-level security limits it to their lists). */
export async function placesNear(lat: number, lng: number): Promise<Place[]> {
  const dLat = 0.45
  const dLng = 0.45 / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .gte('lat', lat - dLat).lte('lat', lat + dLat)
    .gte('lng', lng - dLng).lte('lng', lng + dLng)
    .limit(500)
  if (error) throw error
  return (data ?? []) as Place[]
}

export async function checkDuplicates(c: Candidate): Promise<DuplicateHit[]> {
  try {
    return findDuplicates(c, await placesNear(c.lat, c.lng))
  } catch {
    return [] // never block saving because the check couldn't run
  }
}
