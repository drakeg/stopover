import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DEFAULT_PROFILE, loadProfile, saveProfile, supabase, type NewPlace, type Place, type PlacePatch, type Profile, type Trip } from './lib/supabase'
import { reverseGeocode } from './lib/geo'
import { captureInviteFromUrl, ensureLists, loadMembers, memberName, pendingInvite, type List, type Member } from './lib/lists'
import { Auth, SetNewPassword } from './components/Auth'
import { Account } from './components/Account'
import { AddPlace } from './components/AddPlace'
import { EditPlace } from './components/EditPlace'
import { JoinList } from './components/JoinList'
import { PlacesList } from './components/PlacesList'
import { TripPlanner } from './components/TripPlanner'
import { RoutePlanner } from './components/RoutePlanner'
import { ReviewSheet } from './components/Reviews'
import { PlacePresence } from './components/PlacePresence'
import { Chat } from './components/Chat'
import { JoinFriend, MeetUp } from './components/MeetUp'
import { captureFriendInviteFromUrl, myConversations, pendingFriend, presenceSummaries, type Checkin, type PresenceCount } from './lib/social'
import { myRatings as loadMyRatings, reviewSummaries, syncReviewToPlace, type Summary } from './lib/reviews'

type Tab = 'places' | 'trip' | 'meet'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('places')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Place | null>(null)
  const [places, setPlaces] = useState<Place[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [editFromAccount, setEditFromAccount] = useState(false)
  const [routing, setRouting] = useState<Place[] | null>(null)
  const [lists, setLists] = useState<List[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invite, setInvite] = useState<string | null>(() => captureInviteFromUrl())
  const [reviewing, setReviewing] = useState<Place | null>(null)
  const [summaries, setSummaries] = useState<Record<string, Summary>>({})
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [reviewsKey, setReviewsKey] = useState(0)
  const [chat, setChat] = useState<{ other_id: string; first_name: string; checkin_id?: string | null } | null>(null)
  const [unread, setUnread] = useState(0)
  const [meetKey, setMeetKey] = useState(0)
  const [friendInvite, setFriendInvite] = useState<string | null>(() => captureFriendInviteFromUrl())
  const [presence, setPresence] = useState<Record<string, PresenceCount>>({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') {
        setPlaces([]); setTrips([]); setProfile(null); setShowAccount(false); setLists([]); setActiveId(null); setMembers([])
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Clean auth tokens/codes out of the address bar after following an email link.
  useEffect(() => {
    if (session && /access_token|type=|code=|error_description/.test(window.location.hash + window.location.search)) {
      history.replaceState(null, '', window.location.pathname)
    }
  }, [session])

  useEffect(() => {
    if (!session) return
    loadProfile(session.user).then(setProfile).catch(() => setProfile({ id: session.user.id, ...DEFAULT_PROFILE, active_list_id: null }))
  }, [session])

  // ---------- lists ----------
  const refreshLists = useCallback(async (switchTo?: string) => {
    if (!session) return
    try {
      const ls = await ensureLists(session.user.id)
      setLists(ls)
      setActiveId((cur) => {
        const want = switchTo ?? cur
        if (want && ls.some((l) => l.id === want)) return want
        return ls.find((l) => l.owner_id === session.user.id)?.id ?? ls[0]?.id ?? null
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [session])

  // Once the profile is known, open the list they used last.
  useEffect(() => {
    if (profile) refreshLists(profile.active_list_id ?? undefined)
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeList = useMemo(() => lists.find((l) => l.id === activeId) ?? null, [lists, activeId])

  const switchList = useCallback((id: string) => {
    setActiveId(id)
    setRouting(null)
    setEditing(null)
    if (session) saveProfile(session.user.id, { active_list_id: id }).then(setProfile).catch(() => {})
  }, [session])

  // Remember the open list for next time / other devices.
  useEffect(() => {
    if (session && activeId && profile && profile.active_list_id !== activeId) {
      saveProfile(session.user.id, { active_list_id: activeId }).then(setProfile).catch(() => {})
    }
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeList || activeList.member_count < 2) { setMembers([]); return }
    loadMembers(activeList.id).then(setMembers).catch(() => setMembers([]))
  }, [activeList?.id, activeList?.member_count]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- messages ----------
  const loadUnread = useCallback(async () => {
    if (!session) return
    try { setUnread((await myConversations()).reduce((n, c) => n + Number(c.unread), 0)) } catch { /* ignore */ }
  }, [session])
  useEffect(() => {
    if (!session) return
    loadUnread()
    const ch = supabase
      .channel('inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${session.user.id}` }, () => {
        loadUnread(); setMeetKey((k) => k + 1)
      })
      .subscribe()
    const t = setInterval(loadUnread, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') loadUnread() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { supabase.removeChannel(ch); clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [session, loadUnread])

  // ---------- places ----------
  const loadPlaces = useCallback(async () => {
    if (!activeId) return
    const { data, error } = await supabase.from('places').select('*').eq('list_id', activeId).order('created_at', { ascending: false })
    if (error) setErr(error.message)
    else setPlaces(data as Place[])
  }, [activeId])

  const loadTrips = useCallback(async () => {
    const { data, error } = await supabase.from('trips').select('*').order('created_at', { ascending: false })
    if (error) setErr(error.message)
    else setTrips(data as Trip[])
  }, [])

  useEffect(() => { if (session) loadTrips() }, [session, loadTrips])
  useEffect(() => { setPlaces([]); loadPlaces() }, [loadPlaces])

  // Live sync: someone else on the list adds, edits or removes a place → reload.
  const placesRef = useRef(places)
  placesRef.current = places
  useEffect(() => {
    if (!activeId) return
    let t: ReturnType<typeof setTimeout> | undefined
    const soon = () => { clearTimeout(t); t = setTimeout(loadPlaces, 300) }
    const channel = supabase
      .channel(`places-${activeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'places', filter: `list_id=eq.${activeId}` }, soon)
      // Deletes can't be filtered by list; reload only if it was one of ours.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'places' }, (p) => {
        if (placesRef.current.some((x) => x.id === (p.old as { id?: string })?.id)) soon()
      })
      .subscribe()
    // Phones pause web pages in the background; catch up when the app comes back.
    const onVisible = () => { if (document.visibilityState === 'visible') { loadPlaces(); refreshLists() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(t); supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [activeId, loadPlaces, refreshLists])

  // Star averages for the list (everyone's reviews) and your own ratings of places you've been.
  const placesKey = places.map((p) => `${p.id}:${p.lat}:${p.lng}:${p.name}:${p.visited}`).join('|')
  const loadRatings = useCallback(async () => {
    const ps = placesRef.current
    try {
      const [sum, mine, pres] = await Promise.all([
        reviewSummaries(ps),
        loadMyRatings(ps.filter((p) => p.visited).map((p) => p.id)),
        presenceSummaries(ps.filter((p) => !p.visited)).catch(() => ({})),
      ])
      setSummaries(sum); setRatings(mine); setPresence(pres)
    } catch { /* stars are a nicety; the list works without them */ }
  }, [])
  useEffect(() => {
    const t = setTimeout(loadRatings, 400)
    return () => clearTimeout(t)
  }, [placesKey, loadRatings])

  /**
   * Fills in city/state (and the address, if missing) from the pin, in the background.
   * Saving never waits on this; the free address service allows ~1 lookup per second.
   */
  const enrich = useCallback(async (p: Place) => {
    const r = await reverseGeocode(p).catch(() => null)
    if (!r) return
    const patch: PlacePatch = { city: r.city, state: r.state, country: r.country, ...(p.address ? {} : { address: r.address }) }
    const { data } = await supabase.from('places').update(patch).eq('id', p.id).select().single()
    if (data) setPlaces((ps) => ps.map((x) => (x.id === p.id ? (data as Place) : x)))
  }, [])

  // One-time backfill for places saved before city/state were tracked.
  // A single queue, so lookups stay ~1.2 s apart however often the list re-renders.
  const backfilled = useRef(new Set<string>())
  const queue = useRef<Place[]>([])
  const draining = useRef(false)
  useEffect(() => {
    for (const p of places) {
      if (!p.state && !backfilled.current.has(p.id)) {
        backfilled.current.add(p.id)
        queue.current.push(p)
      }
    }
    if (draining.current || !queue.current.length) return
    draining.current = true
    ;(async () => {
      while (queue.current.length) {
        await enrich(queue.current.shift()!)
        await new Promise((r) => setTimeout(r, 1200))
      }
      draining.current = false
    })()
  }, [places, enrich])

  async function addPlace(p: NewPlace) {
    if (!activeId) throw new Error('No list is open yet — try again in a moment.')
    const { data, error } = await supabase.from('places').insert({ ...p, list_id: activeId }).select().single()
    if (error) throw error
    setAdding(false)
    backfilled.current.add((data as Place).id)
    setPlaces((ps) => [data as Place, ...ps])
    enrich(data as Place)
  }

  async function updatePlace(p: Place, patch: PlacePatch, close = true) {
    const { data, error } = await supabase.from('places').update(patch).eq('id', p.id).select().single()
    if (error) throw error
    const row = data as Place
    if (row.list_id !== activeId) {
      setPlaces((ps) => ps.filter((x) => x.id !== p.id))
      const dest = lists.find((l) => l.id === row.list_id)
      setToast(`Moved “${row.name}” to ${dest ? `“${dest.name}”` : 'another list'}.`)
    } else {
      setPlaces((ps) => ps.map((x) => (x.id === p.id ? row : x)))
      if (patch.lat !== undefined) enrich(row) // moved on the map: city/state may have changed
    }
    // Keep your review pointing at the corrected spot/name (and public once the pin is exact)
    if (patch.lat !== undefined || patch.name !== undefined || patch.approximate !== undefined) {
      syncReviewToPlace(row).then(() => setReviewsKey((k) => k + 1)).catch(() => {})
    }
    if (close) {
      setEditing(null)
      if (editFromAccount) { setShowAccount(true); setEditFromAccount(false) }
    } else if (editing?.id === p.id) {
      setEditing(row)
    }
  }

  /** From Meet up: open the place a check-in belongs to (switching lists if needed). */
  async function openPlaceByCheckin(c: Checkin) {
    if (!c.place_id) return setToast('That place is no longer on any of your lists.')
    const { data } = await supabase.from('places').select('*').eq('id', c.place_id).maybeSingle()
    if (!data) return setToast('That place is no longer on any of your lists.')
    setTab('places'); setShowAccount(false)
    openExisting(data as Place)
  }

  async function setVisited(p: Place, visited: boolean, at: string | null = visited ? new Date().toISOString() : null) {
    const next = { ...p, visited, visited_at: at }
    setPlaces((ps) => ps.map((x) => (x.id === p.id ? next : x)))
    if (editing?.id === p.id) setEditing(next)
    const { error } = await supabase.from('places').update({ visited, visited_at: at }).eq('id', p.id)
    if (error) { setErr(error.message); loadPlaces() }
    return next
  }

  /** "Been": keep it (in the Been there tab) with today's date, and offer to rate it. */
  async function markBeen(p: Place) {
    setReviewing(await setVisited(p, true))
  }

  async function closeReview(result?: { visited_on: string | null }) {
    const p = reviewing
    setReviewing(null)
    if (p && result?.visited_on && p.visited && p.visited_at?.slice(0, 10) !== result.visited_on) {
      await setVisited(p, true, new Date(`${result.visited_on}T12:00:00`).toISOString())
    }
    setReviewsKey((k) => k + 1)
    loadRatings()
  }

  /** From the duplicate warning: jump to the place you already have (switching lists if needed). */
  function openExisting(p: Place) {
    setAdding(false)
    if (p.list_id !== activeId) switchList(p.list_id)
    setEditing(p)
  }

  async function deletePlace(p: Place) {
    setPlaces((ps) => ps.filter((x) => x.id !== p.id))
    const { error } = await supabase.from('places').delete().eq('id', p.id)
    if (error) { setErr(error.message); loadPlaces() }
  }

  const memberNames = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, memberName(m)])), [members])

  if (session === undefined) return <div className="splash" />
  if (recovering && session)
    return <SetNewPassword onDone={() => { setRecovering(false); setToast('Password updated — you’re signed in.') }} />
  if (!session) {
    return <Auth notice={
      invite ? 'You’ve been invited to a shared list. Sign in, or create an account, to join it.'
        : friendInvite ? 'Someone invited you to be friends on Stopover. Sign in, or create an account, to accept.' : undefined} />
  }

  const openLists = () => {
    setShowAccount(true)
    setTimeout(() => document.getElementById('lists')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="sign">STOP</span>over</div>
        <button className="btn link small account-btn" onClick={() => setShowAccount(true)} aria-label="Account">
          {profile?.display_name?.split(' ')[0] || 'Account'} ⚙︎
        </button>
      </header>

      <nav className="tabs">
        <button className={tab === 'places' && !showAccount ? 'on' : ''} onClick={() => { setTab('places'); setShowAccount(false); setRouting(null) }}>My places</button>
        <button className={tab === 'trip' && !showAccount ? 'on' : ''} onClick={() => { setTab('trip'); setShowAccount(false) }}>Plan a trip</button>
        <button className={tab === 'meet' && !showAccount ? 'on' : ''} onClick={() => { setTab('meet'); setShowAccount(false); setChat(null); setMeetKey((k) => k + 1) }}>
          Meet up{unread > 0 && <span className="badge" aria-label={`${unread} unread`}>{unread}</span>}
        </button>
      </nav>

      <main className="content">
        {toast && <p className="ok banner-ok" onClick={() => setToast(null)}>{toast}</p>}
        {err && <p className="error banner" onClick={() => setErr(null)}>{err}</p>}

        {friendInvite ? (
          <JoinFriend code={friendInvite} onDone={(msg) => {
            pendingFriend.clear(); setFriendInvite(null)
            if (msg) { setToast(msg); setTab('meet'); setMeetKey((k) => k + 1) }
          }} />
        ) : invite && lists.length > 0 ? (
          <JoinList
            code={invite}
            current={activeList}
            currentCount={places.length}
            onJoined={async (listId, moved) => {
              pendingInvite.clear(); setInvite(null)
              await refreshLists(listId)
              switchList(listId)
              setShowAccount(false); setTab('places')
              setToast(`You’re on the list.${moved ? ` Moved ${moved} of your places into it.` : ''}`)
            }}
            onDone={() => { pendingInvite.clear(); setInvite(null) }}
          />
        ) : (
          <>
            {showAccount && profile && (
              <Account
                user={session.user}
                profile={profile}
                places={places}
                lists={lists}
                activeListId={activeId}
                onSwitchList={switchList}
                onListsChanged={refreshLists}
                onProfile={setProfile}
                onClose={() => setShowAccount(false)}
                onEditPlace={(p) => { setEditing(p); setTab('places'); setShowAccount(false); setEditFromAccount(true) }}
              />
            )}
            {!showAccount && tab === 'places' && (
              adding
                ? <AddPlace onSave={addPlace} onCancel={() => setAdding(false)} lists={lists} onOpenExisting={openExisting} />
                : routing
                ? <RoutePlanner initial={routing} mapsFirst={profile?.maps_app ?? 'google'} onClose={() => setRouting(null)} />
                : editing
                ? <EditPlace
                    place={editing}
                    lists={lists}
                    addedBy={editing.user_id && editing.user_id !== session.user.id ? memberNames[editing.user_id] : undefined}
                    reviewsKey={reviewsKey}
                    onReview={() => setReviewing(editing)}
                    onSave={(patch) => updatePlace(editing, patch)}
                    onCancel={() => {
                      setEditing(null)
                      if (editFromAccount) { setShowAccount(true); setEditFromAccount(false) }
                    }}>
                    <PlacePresence
                      key={editing.id}
                      place={editing}
                      defaultVisibility={profile?.presence_visibility ?? 'friends'}
                      onFixPin={async (pos) => { await updatePlace(editing, { lat: pos.lat, lng: pos.lng, approximate: false }, false) }}
                      onMessage={(w) => { setChat({ other_id: w.user_id, first_name: w.first_name, checkin_id: w.checkin_id }); setTab('meet') }}
                      onChanged={() => { loadRatings(); setMeetKey((k) => k + 1) }}
                    />
                  </EditPlace>
                : <>
                    <ListBar lists={lists} active={activeList} members={members} meId={session.user.id} onSwitch={switchList} onShare={openLists} />
                    <button className="btn primary wide add" onClick={() => setAdding(true)}>＋ Add a place</button>
                    <PlacesList
                      places={places}
                      addedBy={members.length > 1 ? (p) => (p.user_id && p.user_id !== session.user.id ? memberNames[p.user_id] : undefined) : undefined}
                      summaries={summaries}
                      myRatings={ratings}
                      presence={presence}
                      onEdit={setEditing}
                      onRoute={setRouting}
                      onBeen={markBeen}
                      onUndoBeen={(p) => setVisited(p, false)}
                      onRate={setReviewing}
                      onDelete={deletePlace}
                    />
                  </>
            )}
            {!showAccount && tab === 'trip' && (
              <TripPlanner
                key={`${profile?.default_detour_mi}-${activeId}`}
                places={places}
                trips={trips}
                onTripsChanged={loadTrips}
                defaultDetour={profile?.default_detour_mi ?? 25}
                mapsFirst={profile?.maps_app ?? 'google'}
                summaries={summaries}
              />
            )}
            {!showAccount && tab === 'meet' && (
              chat
                ? <Chat
                    key={chat.other_id}
                    me={session.user.id}
                    other={chat.other_id}
                    firstName={chat.first_name}
                    checkinId={chat.checkin_id}
                    onBack={() => { setChat(null); setMeetKey((k) => k + 1) }}
                    onBlocked={() => { setChat(null); setToast(`Blocked ${chat.first_name}.`); setMeetKey((k) => k + 1); loadUnread() }}
                    onRead={loadUnread}
                  />
                : <MeetUp
                    refreshKey={meetKey}
                    onOpenChat={(c) => setChat(c)}
                    onOpenPlaceByCheckin={openPlaceByCheckin}
                  />
            )}
          </>
        )}
      </main>
      {reviewing && <ReviewSheet place={reviewing} onClose={closeReview} />}
      <footer className="build muted small">Version {__BUILD__}</footer>
    </div>
  )
}

/** Which list you're looking at, who it's shared with, and a quick way to share it. */
function ListBar({ lists, active, members, meId, onSwitch, onShare }: {
  lists: List[]; active: List | null; members: Member[]; meId: string; onSwitch: (id: string) => void; onShare: () => void
}) {
  if (!active) return null
  const others = members.filter((m) => m.user_id !== meId).map(memberName)
  return (
    <div className="list-bar">
      {lists.length > 1 ? (
        <select value={active.id} onChange={(e) => onSwitch(e.target.value)} aria-label="Which list">
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.member_count > 1 ? ' 👥' : ''}</option>)}
        </select>
      ) : (
        <strong className="list-name">{active.name}</strong>
      )}
      <span className="muted small list-share">
        {others.length ? <>Shared with {others.join(', ')}</> : 'Only you'}
        {' · '}
        <button className="btn link small" onClick={onShare}>{others.length ? 'Manage' : 'Share'}</button>
      </span>
    </div>
  )
}
