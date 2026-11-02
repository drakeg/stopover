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
  city: string | null
  state: string | null
  country: string | null
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

/** The address of this app (works at a domain root or in a GitHub Pages subfolder). */
export const appUrl = () => window.location.origin + window.location.pathname

// ---------- Profile & preferences ----------
export type MapsPref = 'google' | 'apple'

export type Profile = {
  id: string
  display_name: string | null
  default_detour_mi: number
  maps_app: MapsPref
}

export const DEFAULT_PROFILE = { display_name: null, default_detour_mi: 25, maps_app: 'google' as MapsPref }

/** Loads the signed-in user's profile, creating it on first use. */
export async function loadProfile(user: { id: string; user_metadata?: Record<string, unknown> }): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (data) return data as Profile
  const fromSignup = typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : null
  const fresh = { id: user.id, ...DEFAULT_PROFILE, display_name: fromSignup }
  const ins = await supabase.from('profiles').insert(fresh).select().single()
  return (ins.data as Profile) ?? fresh
}

export async function saveProfile(id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').upsert({ id, ...patch }).select().single()
  if (error) throw error
  return data as Profile
}
