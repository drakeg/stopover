import { appUrl, supabase, type Place } from './supabase'

export type Visibility = 'no-one' | 'friends' | 'everyone'

export const VISIBILITY: Record<Visibility, { label: string; help: string }> = {
  'no-one': { label: 'No one', help: 'Just for you — handy to remember your plans.' },
  friends: { label: 'Friends', help: 'People you’ve friended and people on your shared lists.' },
  everyone: { label: 'Everyone', help: 'Any Stopover traveler at or going to the same place sees your first name, rig and note.' },
}

export const RIGS = ['Class A', 'Class B / van', 'Class C', 'Fifth wheel', 'Travel trailer', 'Truck camper', 'Toy hauler', 'Pop-up / teardrop', 'Tent / car']

export const HERE_HOURS = 4

export type Checkin = {
  id: string
  user_id: string
  kind: 'here' | 'going'
  place_id: string | null
  osm_id: string | null
  name: string
  lat: number
  lng: number
  visit_date: string | null
  starts_at: string
  ends_at: string
  note: string | null
  visibility: Visibility
}

export type Presence = {
  checkin_id: string
  user_id: string
  first_name: string
  rig: string | null
  kind: 'here' | 'going'
  visit_date: string | null
  starts_at: string
  ends_at: string
  note: string | null
  is_friend: boolean
  mine: boolean
}

export type FriendPlan = Presence & { place_name: string; lat: number; lng: number; osm_id: string | null }

export type Friend = { user_id: string; first_name: string; rig: string | null; via_invite: boolean; shared_lists: string[] }

export type Conversation = {
  other_id: string
  first_name: string
  rig: string | null
  last_body: string
  last_at: string
  last_from_me: boolean
  unread: number
  can_reply: boolean
}

export type Message = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null }

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

// ---------- check-ins ----------
/** Local calendar day → start/end instants in the user's own time zone. */
export function dayBounds(date: string): { starts_at: string; ends_at: string } {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(`${date}T23:59:59`)
  return { starts_at: start.toISOString(), ends_at: end.toISOString() }
}

export async function checkIn(place: Place, opts: { kind: 'here' | 'going'; date?: string; note?: string; visibility: Visibility }): Promise<Checkin> {
  const now = new Date()
  const times = opts.kind === 'here'
    ? { starts_at: now.toISOString(), ends_at: new Date(now.getTime() + HERE_HOURS * 3600e3).toISOString(), visit_date: now.toLocaleDateString('en-CA') }
    : { ...dayBounds(opts.date!), visit_date: opts.date! }
  // One "here" at a time: checking in somewhere ends the previous one
  if (opts.kind === 'here') {
    await supabase.from('checkins').update({ ends_at: now.toISOString() })
      .eq('kind', 'here').gt('ends_at', now.toISOString()).lt('starts_at', now.toISOString())
  }
  const { data, error } = await supabase.from('checkins').insert({
    kind: opts.kind, place_id: place.id, osm_id: place.osm_id ?? null, name: place.name, lat: place.lat, lng: place.lng,
    note: opts.note?.trim() || null, visibility: opts.visibility, ...times,
  }).select().single()
  if (error) throw new Error(error.message)
  return data as Checkin
}

export async function endCheckin(c: Checkin) {
  // "I've left" ends it now; cancelling a future plan removes it
  const q = c.kind === 'here' && new Date(c.starts_at) <= new Date()
    ? supabase.from('checkins').update({ ends_at: new Date(Math.max(Date.now(), new Date(c.starts_at).getTime() + 1)).toISOString() }).eq('id', c.id)
    : supabase.from('checkins').delete().eq('id', c.id)
  const { error } = await q
  if (error) throw new Error(error.message)
}

export async function setCheckinVisibility(id: string, visibility: Visibility) {
  const { error } = await supabase.from('checkins').update({ visibility }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function myCheckins(): Promise<Checkin[]> {
  const { data, error } = await supabase.from('checkins').select('*').gt('ends_at', new Date().toISOString()).order('starts_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as Checkin[]
}

export const whoIsAt = (p: Pick<Place, 'lat' | 'lng' | 'name' | 'osm_id'>) =>
  rpc<Presence[]>('who_is_at', { p_lat: p.lat, p_lng: p.lng, p_name: p.name, p_osm: p.osm_id ?? null })

export const friendsPlans = () => rpc<FriendPlan[]>('friends_plans')

export type PresenceCount = { here: number; going: number }
export async function presenceSummaries(places: Place[]): Promise<Record<string, PresenceCount>> {
  const out: Record<string, PresenceCount> = {}
  const exact = places.filter((p) => !p.approximate || p.osm_id)
  for (let i = 0; i < exact.length; i += 500) {
    const rows = await rpc<{ key: string; here_count: number; going_count: number }[]>('presence_summaries', {
      p_places: exact.slice(i, i + 500).map((p) => ({ key: p.id, lat: p.lat, lng: p.lng, name: p.name, osm: p.osm_id ?? null })),
    })
    for (const r of rows) out[r.key] = { here: Number(r.here_count), going: Number(r.going_count) }
  }
  return out
}

// ---------- friends ----------
export const myFriends = () => rpc<Friend[]>('my_friends')
export const removeFriend = (id: string) => rpc<void>('remove_friend', { p_other: id })

export async function createFriendInvite(): Promise<string> {
  const { data, error } = await supabase.from('friend_invites').insert({}).select('code').single()
  if (error) throw new Error(error.message)
  return `${appUrl()}?friend=${encodeURIComponent(data.code)}`
}
export const friendInviteInfo = async (code: string) =>
  ((await rpc<{ inviter: string | null; status: string }[]>('friend_invite_info', { p_code: code }))[0] ?? { inviter: null, status: 'invalid' })
export const acceptFriendInvite = (code: string) => rpc<string>('accept_friend_invite', { p_code: code })

const PENDING_FRIEND = 'stopover.pendingFriend'
export const pendingFriend = {
  get(): string | null { try { return localStorage.getItem(PENDING_FRIEND) } catch { return null } },
  set(c: string) { try { localStorage.setItem(PENDING_FRIEND, c) } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(PENDING_FRIEND) } catch { /* ignore */ } },
}
export function captureFriendInviteFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('friend')
  if (!code || !/^[a-f0-9]{16,128}$/i.test(code)) return pendingFriend.get()
  pendingFriend.set(code)
  params.delete('friend')
  const rest = params.toString()
  history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
  return code
}

// ---------- messages ----------
export const myConversations = () => rpc<Conversation[]>('my_conversations')
export const traveler = async (id: string) =>
  (await rpc<{ first_name: string; rig: string | null; is_friend: boolean; can_message: boolean }[]>('traveler', { p_other: id }))[0]
export const markRead = (id: string) => rpc<void>('mark_read', { p_other: id })

export async function thread(other: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, recipient_id, body, created_at, read_at')
    .or(`sender_id.eq.${other},recipient_id.eq.${other}`)
    .order('created_at')
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as Message[]
}

export async function sendMessage(to: string, body: string, checkinId?: string | null) {
  const { error } = await supabase.from('messages').insert({ recipient_id: to, body: body.trim(), checkin_id: checkinId ?? null })
  if (error) {
    throw new Error(/row-level security/i.test(error.message)
      ? 'You can’t message this person right now (their check-in may have ended, or one of you blocked the other).'
      : error.message)
  }
}

// ---------- safety ----------
export async function block(id: string) {
  const { error } = await supabase.from('blocks').insert({ blocked_id: id })
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message)
}
export async function unblock(id: string) {
  const { error } = await supabase.from('blocks').delete().eq('blocked_id', id)
  if (error) throw new Error(error.message)
}
export const blockedPeople = () => rpc<{ user_id: string; first_name: string; blocked_at: string }[]>('blocked_people')

export async function report(id: string, reason: string, messageId?: string | null) {
  const { error } = await supabase.from('reports').insert({ reported_id: id, reason: reason.trim() || null, message_id: messageId ?? null })
  if (error) throw new Error(error.message)
}

// ---------- display ----------
export function whenLabel(p: Pick<Presence, 'kind' | 'visit_date' | 'starts_at' | 'ends_at'>, now = new Date()): string {
  if (p.kind === 'here') {
    const mins = Math.round((now.getTime() - new Date(p.starts_at).getTime()) / 60000)
    return mins < 2 ? 'here now · just arrived' : `here now · since ${new Date(p.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  const d = new Date(`${p.visit_date}T12:00:00`)
  const today = new Date(now.toLocaleDateString('en-CA') + 'T12:00:00')
  const days = Math.round((d.getTime() - today.getTime()) / 86400e3)
  if (days === 0) return 'going today'
  if (days === 1) return 'going tomorrow'
  return `going ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
}
