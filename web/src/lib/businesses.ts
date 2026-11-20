import { lineString, point } from '@turf/helpers'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import { supabase, type Place } from './supabase'
import type { LatLng } from './geo'

export type Hookups = 'none' | 'water-electric' | '30a' | '50a' | 'full'
export const HOOKUPS: Record<Hookups, string> = {
  none: 'No hookups',
  'water-electric': 'Water + electric',
  '30a': '30-amp electric',
  '50a': '50-amp electric',
  full: 'Full hookups',
}

/** What travelers see about a business (verified listings, or your own). */
export type BusinessInfo = {
  id: string
  name: string
  category: string | null
  description: string | null
  website: string | null
  phone: string | null
  max_rig_ft: number | null
  big_rig_parking: boolean | null
  hookups: Hookups | null
  pets: boolean | null
  offer: string | null
}
export type BusinessAt = BusinessInfo & { featured: boolean; mine: boolean; status: BusinessStatus }
export type Featured = BusinessInfo & LatLng & { osm_id: string | null }

export type BusinessStatus = 'pending' | 'verified' | 'rejected'
/** The owner's full row. */
export type MyBusiness = BusinessInfo & LatLng & {
  status: BusinessStatus
  osm_id: string | null
  claimant_role: string | null
  claim_note: string | null
  review_note: string | null
  featured_until: string | null
  created_at: string
}
export type BusinessEdits = Partial<Pick<MyBusiness,
  'name' | 'category' | 'description' | 'website' | 'phone' | 'max_rig_ft' | 'big_rig_parking' | 'hookups' | 'pets' | 'offer'>>

export type BusinessStats = { saved: number; visited: number; here_now: number; going: number; reviews: number; avg_rating: number | null }

export type AdminBusiness = {
  id: string; name: string; status: BusinessStatus; category: string | null; lat: number; lng: number; osm_id: string | null
  website: string | null; phone: string | null; claimant_role: string | null; claim_note: string | null; review_note: string | null
  owner_name: string; owner_email: string | null; featured_until: string | null; created_at: string
}

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

/** Blank strings become null; a website without a scheme gets https://. */
export function cleanEdits(e: BusinessEdits): BusinessEdits {
  const out: BusinessEdits = { ...e }
  for (const k of ['name', 'category', 'description', 'website', 'phone', 'offer'] as const) {
    if (k in out) {
      const v = (out[k] ?? '').toString().trim()
      ;(out as Record<string, unknown>)[k] = v || null
    }
  }
  if (out.website && !/^https?:\/\//i.test(out.website)) out.website = `https://${out.website}`
  if (out.website && /\s/.test(out.website)) throw new Error('Website can’t contain spaces.')
  if (out.max_rig_ft != null && (out.max_rig_ft < 10 || out.max_rig_ft > 80)) throw new Error('Max rig length must be 10–80 ft.')
  return out
}

export async function businessAt(p: Pick<Place, 'lat' | 'lng' | 'name' | 'osm_id'>): Promise<BusinessAt | null> {
  const rows = await rpc<BusinessAt[]>('business_at', { p_lat: p.lat, p_lng: p.lng, p_name: p.name, p_osm: p.osm_id })
  return rows[0] ?? null
}

export async function myBusinesses(): Promise<MyBusiness[]> {
  const { data, error } = await supabase.from('businesses').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as MyBusiness[]
}

export type ClaimInput = { claimant_role: string; claim_note: string; website: string; phone: string }

export async function claimBusiness(place: Place, input: ClaimInput): Promise<MyBusiness> {
  if (place.approximate) throw new Error('Fix this place’s pin to the exact spot before claiming it.')
  const edits = cleanEdits({ name: place.name, category: place.category, website: input.website, phone: input.phone })
  const { data, error } = await supabase.from('businesses').insert({
    ...edits,
    name: place.name, lat: place.lat, lng: place.lng, osm_id: place.osm_id,
    claimant_role: input.claimant_role.trim() || null, claim_note: input.claim_note.trim() || null,
  }).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('Someone has already claimed this place. If it’s yours, contact us and we’ll sort it out.')
    throw new Error(error.message)
  }
  return data as MyBusiness
}

export async function updateBusiness(id: string, edits: BusinessEdits): Promise<MyBusiness> {
  const { data, error } = await supabase.from('businesses').update(cleanEdits(edits)).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return data as MyBusiness
}

export async function deleteBusiness(id: string) {
  const { error } = await supabase.from('businesses').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function businessStats(id: string): Promise<BusinessStats> {
  const rows = await rpc<BusinessStats[]>('business_stats', { p_business: id })
  const r = rows[0]
  return {
    saved: Number(r?.saved ?? 0), visited: Number(r?.visited ?? 0), here_now: Number(r?.here_now ?? 0),
    going: Number(r?.going ?? 0), reviews: Number(r?.reviews ?? 0), avg_rating: r?.avg_rating == null ? null : Number(r.avg_rating),
  }
}

// ---------- Featured along a route ----------
const MI_PER_DEG_LAT = 69

/** Bounding box of a route ([lng, lat] pairs) widened by `padMi` on every side. */
export function routeBounds(coords: [number, number][], padMi: number) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  for (const [lng, lat] of coords) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng)
  }
  const dLat = padMi / MI_PER_DEG_LAT
  const widest = Math.max(Math.abs(minLat), Math.abs(maxLat))
  const dLng = padMi / (MI_PER_DEG_LAT * Math.max(Math.cos((widest * Math.PI) / 180), 0.05))
  return {
    minLat: Math.max(minLat - dLat, -90), maxLat: Math.min(maxLat + dLat, 90),
    minLng: Math.max(minLng - dLng, -180), maxLng: Math.min(maxLng + dLng, 180),
  }
}

export type FeaturedStop = { business: Featured; offRouteMi: number; milesFromStart: number }

/** Keeps businesses within `maxMi` of the route, in driving order, minus any already in `skipNear`. */
export function featuredAlongRoute(businesses: Featured[], coords: [number, number][], maxMi: number, skipNear: LatLng[] = []): FeaturedStop[] {
  if (coords.length < 2) return []
  const line = lineString(coords)
  const out: FeaturedStop[] = []
  for (const b of businesses) {
    // already one of the traveler's own stops (within ~150 m)
    if (skipNear.some((p) => Math.abs(p.lat - b.lat) < 0.0015 && Math.abs(p.lng - b.lng) < 0.002)) continue
    const n = nearestPointOnLine(line, point([b.lng, b.lat]), { units: 'miles' })
    const off = n.properties.dist ?? Infinity
    if (off <= maxMi) out.push({ business: b, offRouteMi: off, milesFromStart: n.properties.location ?? 0 })
  }
  return out.sort((a, b) => a.milesFromStart - b.milesFromStart)
}

export async function featuredNearRoute(coords: [number, number][], maxMi: number, skipNear: LatLng[] = []): Promise<FeaturedStop[]> {
  if (coords.length < 2) return []
  const b = routeBounds(coords, maxMi)
  const rows = await rpc<Featured[]>('featured_businesses', { p_min_lat: b.minLat, p_max_lat: b.maxLat, p_min_lng: b.minLng, p_max_lng: b.maxLng })
  return featuredAlongRoute(rows, coords, maxMi, skipNear)
}

/** "Max rig 45 ft · Big-rig parking · Full hookups · Pets welcome" */
export function rvFacts(b: Pick<BusinessInfo, 'max_rig_ft' | 'big_rig_parking' | 'hookups' | 'pets'>): string[] {
  const f: string[] = []
  if (b.max_rig_ft) f.push(`Rigs up to ${b.max_rig_ft} ft`)
  if (b.big_rig_parking === true) f.push('Big-rig parking')
  if (b.big_rig_parking === false) f.push('No big-rig parking')
  if (b.hookups) f.push(HOOKUPS[b.hookups])
  if (b.pets === true) f.push('Pets welcome')
  if (b.pets === false) f.push('No pets')
  return f
}

// ---------- Admin ----------
export const adminBusinesses = (status: BusinessStatus | 'all' = 'pending') => rpc<AdminBusiness[]>('admin_businesses', { p_status: status })
export const reviewBusiness = (id: string, action: 'verify' | 'reject', note?: string) =>
  rpc<void>('admin_review_business', { p_business: id, p_action: action, p_note: note?.trim() || null })
export const featureBusiness = (id: string, days: number) => rpc<string | null>('admin_feature_business', { p_business: id, p_days: days })
