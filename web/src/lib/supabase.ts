import { createClient } from '@supabase/supabase-js'

// The publishable key is designed to ship in client apps; row-level security
// in the database is what keeps each user's data private.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://bjjfgdxwqzthdjeebbyf.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_a_TsaqVP0x3-G0VyNemQ4A_ynFuiw0n'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export type Place = {
  id: string
  user_id: string
  name: string
  notes: string | null
  category: string | null
  address: string | null
  lat: number
  lng: number
  url: string | null
  near: string | null
  approximate: boolean
  visited: boolean
  visited_at: string | null
  created_at: string
}

export type NewPlace = Pick<Place, 'name' | 'lat' | 'lng'> &
  Partial<Pick<Place, 'notes' | 'category' | 'address' | 'url' | 'near' | 'approximate'>>

export type PlacePatch = Partial<Omit<Place, 'id' | 'user_id' | 'created_at'>>

export type Trip = {
  id: string
  name: string
  start_label: string
  start_lat: number
  start_lng: number
  end_label: string
  end_lat: number
  end_lng: number
  max_detour_mi: number
  created_at: string
}

export const CATEGORIES = [
  'Historic site',
  'National / state park',
  'Museum',
  'Scenic view',
  'Roadside attraction',
  'Food',
  'Campground',
  'Other',
] as const
