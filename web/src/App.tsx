import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type NewPlace, type Place, type PlacePatch, type Trip } from './lib/supabase'
import { reverseGeocode } from './lib/geo'
import { Auth } from './components/Auth'
import { AddPlace } from './components/AddPlace'
import { EditPlace } from './components/EditPlace'
import { PlacesList } from './components/PlacesList'
import { TripPlanner } from './components/TripPlanner'

type Tab = 'places' | 'trip'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [tab, setTab] = useState<Tab>('places')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Place | null>(null)
  const [places, setPlaces] = useState<Place[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

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

  async function addPlace(p: NewPlace) {
    const { data, error } = await supabase.from('places').insert(p).select().single()
    if (error) throw error
    setAdding(false)
    setPlaces((ps) => [data as Place, ...ps])
    // Quick adds skip the address lookup so saving is instant; fill it in afterwards.
    if (!p.address) {
      reverseGeocode(p).then((r) => r && updatePlace(data as Place, { address: r.address }, false)).catch(() => {})
    }
  }

  async function updatePlace(p: Place, patch: PlacePatch, close = true) {
    const { data, error } = await supabase.from('places').update(patch).eq('id', p.id).select().single()
    if (error) throw error
    setPlaces((ps) => ps.map((x) => (x.id === p.id ? (data as Place) : x)))
    if (close) setEditing(null)
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
  if (!session) return <Auth />

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="sign">STOP</span>over</div>
        <button className="btn link small" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <nav className="tabs">
        <button className={tab === 'places' ? 'on' : ''} onClick={() => setTab('places')}>My places</button>
        <button className={tab === 'trip' ? 'on' : ''} onClick={() => setTab('trip')}>Plan a trip</button>
      </nav>

      <main className="content">
        {err && <p className="error banner" onClick={() => setErr(null)}>{err}</p>}
        {tab === 'places' && (
          adding
            ? <AddPlace onSave={addPlace} onCancel={() => setAdding(false)} />
            : editing
            ? <EditPlace place={editing} onSave={(patch) => updatePlace(editing, patch)} onCancel={() => setEditing(null)} />
            : <>
                <button className="btn primary wide add" onClick={() => setAdding(true)}>＋ Add a place</button>
                <PlacesList places={places} onEdit={setEditing} onToggleVisited={toggleVisited} onDelete={deletePlace} />
              </>
        )}
        {tab === 'trip' && <TripPlanner places={places} trips={trips} onTripsChanged={loadTrips} />}
      </main>
      <footer className="build muted small">Version {__BUILD__}</footer>
    </div>
  )
}
