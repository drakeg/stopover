import { supabase, type Place } from './supabase'

export type Parking = 'big-rig' | 'some-rv' | 'tight' | 'none'

export const PARKING: Record<Parking, string> = {
  'big-rig': 'Big-rig friendly',
  'some-rv': 'Some RV parking',
  tight: 'Tight — tow vehicle only',
  none: 'No parking nearby',
}

export type Review = {
  id: string
  rating: number
  parking: Parking | null
  cost: string | null
  note: string | null
  visited_on: string | null
  created_at: string
  reviewer: string
  mine: boolean
}

export type MyReview = {
  id: string
  place_id: string | null
  rating: number
  parking: Parking | null
  cost: string | null
  note: string | null
  visited_on: string | null
}

export type ReviewInput = Pick<MyReview, 'rating' | 'parking' | 'cost' | 'note' | 'visited_on'>

export type Summary = { avg: number; count: number }

/** Everyone's reviews of the place this row refers to. */
export async function placeReviews(p: Pick<Place, 'lat' | 'lng' | 'name' | 'osm_id'>): Promise<Review[]> {
  const { data, error } = await supabase.rpc('place_reviews', { p_lat: p.lat, p_lng: p.lng, p_name: p.name, p_osm: p.osm_id ?? null })
  if (error) throw error
  return (data ?? []) as Review[]
}

/** Average stars per place id. Approximate pins only match by OSM id or the user's own review. */
export async function reviewSummaries(places: Place[]): Promise<Record<string, Summary>> {
  if (!places.length) return {}
  const out: Record<string, Summary> = {}
  for (let i = 0; i < places.length; i += 500) {
    const batch = places.slice(i, i + 500).map((p) => ({ key: p.id, lat: p.lat, lng: p.lng, name: p.name, osm: p.osm_id ?? null }))
    const { data, error } = await supabase.rpc('review_summaries', { p_places: batch })
    if (error) throw error
    for (const r of (data ?? []) as { key: string; avg_rating: number; review_count: number }[]) {
      out[r.key] = { avg: Number(r.avg_rating), count: Number(r.review_count) }
    }
  }
  return out
}

export async function myReview(placeId: string): Promise<MyReview | null> {
  const { data, error } = await supabase.from('reviews').select('*').eq('place_id', placeId).maybeSingle()
  if (error) throw error
  return data as MyReview | null
}

/** Your ratings for many of your places at once. */
export async function myRatings(placeIds: string[]): Promise<Record<string, number>> {
  if (!placeIds.length) return {}
  const { data, error } = await supabase.from('reviews').select('place_id, rating').in('place_id', placeIds)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((r: { place_id: string; rating: number }) => [r.place_id, r.rating]))
}

export async function saveReview(place: Place, input: ReviewInput, existingId?: string | null) {
  const row = {
    ...input,
    cost: input.cost?.trim() || null,
    note: input.note?.trim() || null,
    place_id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    osm_id: place.osm_id ?? null,
    approximate: place.approximate,
  }
  const q = existingId
    ? supabase.from('reviews').update(row).eq('id', existingId)
    : supabase.from('reviews').insert(row)
  const { error } = await q
  if (error) throw error
}

export async function deleteReview(id: string) {
  const { error } = await supabase.from('reviews').delete().eq('id', id)
  if (error) throw error
}

/** Keep your review pointing at the right spot when you fix a place's pin or name. */
export async function syncReviewToPlace(place: Place) {
  await supabase
    .from('reviews')
    .update({ name: place.name, lat: place.lat, lng: place.lng, osm_id: place.osm_id ?? null, approximate: place.approximate })
    .eq('place_id', place.id)
}

export const stars = (n: number) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n))
