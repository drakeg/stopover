import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DEFAULT_PROFILE, loadProfile, supabase, type NewPlace, type Place, type PlacePatch, type Profile, type Trip } from './lib/supabase'
import { reverseGeocode } from './lib/geo'
import { Auth, SetNewPassword } from './components/Auth'
import { Account } from './components/Account'
import { AddPlace } from './components/AddPlace'
import { EditPlace } from './components/EditPlace'
import { PlacesList } from './components/PlacesList'
import { TripPlanner } from './components/TripPlanner'
import { RoutePlanner } from './components/RoutePlanner'

type Tab = 'places' | 'trip'

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') { setPlaces([]); setTrips([]); setProfile(null); setShowAccount(false) }
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
    loadProfile(session.user).then(setProfile).catch(() => setProfile({ id: session.user.id, ...DEFAULT_PROFILE }))
  }, [session])

  const loadPlaces = useCallback(async () => {
    const { data, error } = await supabase.from('places').select('*').order('created_at', { ascending: false })
    if (error) setErr(error.message)
    else setPlaces(data as Place[])
  }, [])

  const loadTrips = useCallback(async () => {
    const { data, error } = await supabase.from('trips').select('*').order('created_at', { ascending: false })
    if (error) setErr(error.message)
    else setTrips(data as Trip[])
  }, [])

  useEffect(() => {
    if (session) { loadPlaces(); loadTrips() }
  }, [session, loadPlaces, loadTrips])

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
    const { data, error } = await supabase.from('places').insert(p).select().single()
    if (error) throw error
    setAdding(false)
    backfilled.current.add((data as Place).id)
    setPlaces((ps) => [data as Place, ...ps])
    enrich(data as Place)
  }

  async function updatePlace(p: Place, patch: PlacePatch, close = true) {
    const { data, error } = await supabase.from('places').update(patch).eq('id', p.id).select().single()
    if (error) throw error
    setPlaces((ps) => ps.map((x) => (x.id === p.id ? (data as Place) : x)))
    if (patch.lat !== undefined) enrich(data as Place) // moved: city/state may have changed
    if (close) {
      setEditing(null)
      if (editFromAccount) { setShowAccount(true); setEditFromAccount(false) }
    }
  }

  async function toggleVisited(p: Place) {
    const visited = !p.visited
    setPlaces((ps) => ps.map((x) => (x.id === p.id ? { ...x, visited } : x)))
    const { error } = await supabase
      .from('places')
      .update({ visited, visited_at: visited ? new Date().toISOString() : null })
      .eq('id', p.id)
    if (error) { setErr(error.message); loadPlaces() }
  }

  async function deletePlace(p: Place) {
    setPlaces((ps) => ps.filter((x) => x.id !== p.id))
    const { error } = await supabase.from('places').delete().eq('id', p.id)
    if (error) { setErr(error.message); loadPlaces() }
  }

  if (session === undefined) return <div className="splash" />
  if (recovering && session)
    return <SetNewPassword onDone={() => { setRecovering(false); setToast('Password updated — you’re signed in.') }} />
  if (!session) return <Auth />

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
      </nav>

      <main className="content">
        {toast && <p className="ok banner-ok" onClick={() => setToast(null)}>{toast}</p>}
        {err && <p className="error banner" onClick={() => setErr(null)}>{err}</p>}
        {showAccount && profile && (
          <Account
            user={session.user}
            profile={profile}
            places={places}
            onProfile={setProfile}
            onClose={() => setShowAccount(false)}
            onEditPlace={(p) => { setEditing(p); setTab('places'); setShowAccount(false); setEditFromAccount(true) }}
          />
        )}
        {!showAccount && tab === 'places' && (
          adding
            ? <AddPlace onSave={addPlace} onCancel={() => setAdding(false)} />
            : routing
            ? <RoutePlanner initial={routing} mapsFirst={profile?.maps_app ?? 'google'} onClose={() => setRouting(null)} />
            : editing
            ? <EditPlace place={editing} onSave={(patch) => updatePlace(editing, patch)} onCancel={() => {
                setEditing(null)
                if (editFromAccount) { setShowAccount(true); setEditFromAccount(false) }
              }} />
            : <>
                <button className="btn primary wide add" onClick={() => setAdding(true)}>＋ Add a place</button>
                <PlacesList places={places} onEdit={setEditing} onRoute={setRouting} onToggleVisited={toggleVisited} onDelete={deletePlace} />
              </>
        )}
        {!showAccount && tab === 'trip' && (
          <TripPlanner
            key={profile?.default_detour_mi}
            places={places}
            trips={trips}
            onTripsChanged={loadTrips}
            defaultDetour={profile?.default_detour_mi ?? 25}
            mapsFirst={profile?.maps_app ?? 'google'}
          />
        )}
      </main>
      <footer className="build muted small">Version {__BUILD__}</footer>
    </div>
  )
}
