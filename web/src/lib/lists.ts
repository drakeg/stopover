import { appUrl, supabase } from './supabase'

export type List = {
  id: string
  name: string
  owner_id: string
  created_at: string
  member_count: number
}

export type Member = {
  user_id: string
  role: 'owner' | 'editor'
  display_name: string | null
  email: string | null
  joined_at: string
}

export type InviteInfo = {
  list_id: string | null
  list_name: string | null
  inviter: string | null
  place_count: number | null
  status: 'ok' | 'member' | 'used' | 'expired' | 'invalid'
}

export const DEFAULT_LIST_NAME = 'My places'

export const memberName = (m: Pick<Member, 'display_name' | 'email'>) =>
  m.display_name?.trim() || m.email?.split('@')[0] || 'Someone'

export async function loadLists(): Promise<List[]> {
  const { data, error } = await supabase.from('lists').select('*, list_members(count)').order('created_at')
  if (error) throw error
  return (data ?? []).map(({ list_members, ...l }: { list_members: { count: number }[] } & Omit<List, 'member_count'>) => ({
    ...l,
    member_count: list_members?.[0]?.count ?? 1,
  }))
}

/** Every account has at least one list; makes "My places" if there isn't one. */
export async function ensureLists(userId: string): Promise<List[]> {
  const lists = await loadLists()
  if (lists.length) return lists
  await createList(DEFAULT_LIST_NAME, userId)
  return loadLists()
}

export async function createList(name: string, userId: string): Promise<string> {
  const { data, error } = await supabase.from('lists').insert({ name: name.trim(), owner_id: userId }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function renameList(id: string, name: string) {
  const { error } = await supabase.from('lists').update({ name: name.trim() }).eq('id', id)
  if (error) throw error
}

export async function deleteList(id: string) {
  const { error } = await supabase.from('lists').delete().eq('id', id)
  if (error) throw error
}

export async function leaveList(id: string, userId: string) {
  const { error } = await supabase.from('list_members').delete().eq('list_id', id).eq('user_id', userId)
  if (error) throw error
}

export async function removeMember(listId: string, userId: string) {
  const { error } = await supabase.from('list_members').delete().eq('list_id', listId).eq('user_id', userId)
  if (error) throw error
}

export async function loadMembers(listId: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc('list_members_named', { p_list: listId })
  if (error) throw error
  return (data ?? []) as Member[]
}

/** Moves every place from one list to another (both must be the user's lists). */
export async function movePlaces(fromList: string, toList: string): Promise<number> {
  const { data, error } = await supabase.from('places').update({ list_id: toList }).eq('list_id', fromList).select('id')
  if (error) throw error
  return data?.length ?? 0
}

// ---------- invites ----------
export async function createInvite(listId: string): Promise<{ code: string; expires_at: string }> {
  const { data, error } = await supabase.from('list_invites').insert({ list_id: listId }).select('code, expires_at').single()
  if (error) throw error
  return data as { code: string; expires_at: string }
}

export const inviteUrl = (code: string) => `${appUrl()}?join=${encodeURIComponent(code)}`

export async function inviteInfo(code: string): Promise<InviteInfo> {
  const { data, error } = await supabase.rpc('invite_info', { p_code: code })
  if (error) throw error
  return ((data ?? [])[0] ?? { status: 'invalid' }) as InviteInfo
}

export async function acceptInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_invite', { p_code: code })
  if (error) throw new Error(error.message)
  return data as string
}

// A pending invite survives sign-up, email confirmation and sign-in (same browser).
const PENDING = 'stopover.pendingInvite'
export const pendingInvite = {
  get(): string | null {
    try { return localStorage.getItem(PENDING) } catch { return null }
  },
  set(code: string) {
    try { localStorage.setItem(PENDING, code) } catch { /* private mode: invite still works this visit */ }
  },
  clear() {
    try { localStorage.removeItem(PENDING) } catch { /* ignore */ }
  },
}

/** Picks up ?join=CODE from the address bar (then removes it from the URL). */
export function captureInviteFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('join')
  if (!code || !/^[a-f0-9]{16,128}$/i.test(code)) return pendingInvite.get()
  pendingInvite.set(code)
  params.delete('join')
  const rest = params.toString()
  history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
  return code
}
