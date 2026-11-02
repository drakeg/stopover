import { useEffect, useRef, useState } from 'react'
import { reverseGeocode, type LatLng } from '../lib/geo'
import { getCurrentLocation } from '../lib/location'
import { CATEGORIES, type NewPlace } from '../lib/supabase'
import { LocationSearch } from './LocationSearch'
import { MapView } from './MapView'

type Gps = { status: 'locating' } | { status: 'ok'; pos: LatLng } | { status: 'error'; msg: string }

/**
 * Quick add: built for a co-pilot at highway speed. Location is grabbed the
 * moment this opens (so it's where you saw the sign, not a mile later), and the
 * only thing to type is what the sign said.
 */
export function AddPlace({ onSave, onCancel }: { onSave: (p: NewPlace) => Promise<void>; onCancel: () => void }) {
  const [precise, setPrecise] = useState(false)
  const [gps, setGps] = useState<Gps>({ status: 'locating' })
  const gpsPromise = useRef<Promise<LatLng> | null>(null)
  const [name, setName] = useState('')
  const [near, setNear] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const p = getCurrentLocation()
    gpsPromise.current = p
    p.then(
      (pos) => setGps({ status: 'ok', pos }),
      (e) => setGps({ status: 'error', msg: e instanceof Error ? e.message : String(e) }),
    )
  }, [])

  async function quickSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const pos = await gpsPromise.current!
      await onSave({ name: name.trim(), near: near.trim() || null, lat: pos.lat, lng: pos.lng, approximate: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  if (precise) return <PreciseAdd initialName={name} initialNear={near} onSave={onSave} onCancel={onCancel} />

  return (
    <section className="card">
      <h2>Quick add</h2>
      <form onSubmit={quickSave} className="stack">
        <label>
          What did the sign say?
          <input
            className="big-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Manhattan Project Historic Site"
            autoFocus
            required
            maxLength={200}
            autoCapitalize="words"
            enterKeyHint="done"
          />
        </label>
        <label>
          <span>Where? <span className="muted small">(optional)</span></span>
          <input value={near} onChange={(e) => setNear(e.target.value)} placeholder="e.g. I-40 exit 356" enterKeyHint="done" />
        </label>

        <p className={`gps ${gps.status}`}>
          {gps.status === 'locating' && '📍 Getting your location…'}
          {gps.status === 'ok' && '📍 Location captured — saving it right where you are'}
          {gps.status === 'error' && `⚠️ ${gps.msg}`}
        </p>

        {err && <p className="error">{err}</p>}
        {gps.status === 'error' ? (
          <button type="button" className="btn primary wide" onClick={() => setPrecise(true)}>Pick the spot on the map</button>
        ) : (
          <button className="btn primary wide big" disabled={busy || !name.trim()}>
            {busy ? (gps.status === 'locating' ? 'Waiting for location…' : 'Saving…') : 'Save'}
          </button>
        )}
        <div className="row spread">
          <button type="button" className="btn link" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn link" onClick={() => setPrecise(true)}>Search or pick on map instead</button>
        </div>
      </form>
    </section>
  )
}

/** Slower path for when you're not on the road: search or tap the map, add details. */
function PreciseAdd({ initialName, initialNear, onSave, onCancel }: {
  initialName: string; initialNear: string; onSave: (p: NewPlace) => Promise<void>; onCancel: () => void
}) {
  const [spot, setSpot] = useState<LatLng | null>(null)
  const [name, setName] = useState(initialName)
  const [near, setNear] = useState(initialNear)
  const [address, setAddress] = useState('')
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function chooseSpot(p: LatLng, label?: string) {
    setSpot(p)
    if (label) {
      if (!name) setName(label.split(',')[0])
      setAddress(label)
      return
    }
    const r = await reverseGeocode(p).catch(() => null)
    if (r) setAddress(r.address)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!spot || !name.trim()) return
    setBusy(true)
    try {
      await onSave({
        name: name.trim(), lat: spot.lat, lng: spot.lng, near: near.trim() || null,
        address: address || null, category: category || null, notes: notes.trim() || null, approximate: false,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Add a place</h2>
      <LocationSearch placeholder="Search a town, address, or paste coordinates" onSelect={(l) => chooseSpot(l, l.label)} />
      <p className="muted small">Search to get close, then tap the map to set the exact spot.</p>
      <MapView
        height={260}
        pins={spot ? [{ ...spot, id: 'draft', title: name || 'New place', kind: 'draft' }] : []}
        onPick={(p) => chooseSpot(p)}
      />
      {err && <p className="error">{err}</p>}
      <form onSubmit={save} className="stack">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} /></label>
        <label><span>Where <span className="muted small">(optional)</span></span><input value={near} onChange={(e) => setNear(e.target.value)} placeholder="e.g. I-40 exit 356" /></label>
        <label>
          Type
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Why you want to go, hours, RV parking…" /></label>
        {address && <p className="muted small">{address}</p>}
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={busy || !spot || !name.trim()}>{spot ? 'Save to my list' : 'Tap the map first'}</button>
        </div>
      </form>
    </section>
  )
}
