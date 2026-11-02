import { useState } from 'react'
import { reverseGeocode, type LatLng } from '../lib/geo'
import { getCurrentLocation } from '../lib/location'
import { CATEGORIES, type NewPlace } from '../lib/supabase'
import { LocationSearch } from './LocationSearch'
import { MapView } from './MapView'

type Mode = 'here' | 'search' | 'map'

export function AddPlace({ onSave, onCancel }: { onSave: (p: NewPlace) => Promise<void>; onCancel: () => void }) {
  const [mode, setMode] = useState<Mode>('here')
  const [spot, setSpot] = useState<LatLng | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [category, setCategory] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function chooseSpot(p: LatLng, label?: string) {
    setSpot(p)
    setErr(null)
    if (label) {
      if (!name) setName(label.split(',')[0])
      setAddress(label)
      return
    }
    const r = await reverseGeocode(p).catch(() => null)
    if (r) {
      if (!name) setName(r.name)
      setAddress(r.address)
    }
  }

  async function grabLocation() {
    setBusy(true)
    setErr(null)
    try {
      await chooseSpot(await getCurrentLocation())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!spot || !name.trim()) return
    setBusy(true)
    try {
      await onSave({
        name: name.trim(),
        lat: spot.lat,
        lng: spot.lng,
        address: address || null,
        category: category || null,
        notes: notes.trim() || null,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Add a place</h2>
      <div className="segmented" role="tablist">
        {(['here', 'search', 'map'] as Mode[]).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {m === 'here' ? 'Where I am' : m === 'search' ? 'Search' : 'Pick on map'}
          </button>
        ))}
      </div>

      {mode === 'here' && (
        <button className="btn primary wide" onClick={grabLocation} disabled={busy}>
          {busy ? 'Finding you…' : '📍 Use my current location'}
        </button>
      )}
      {mode === 'search' && (
        <LocationSearch placeholder="e.g. Manhattan Project Oak Ridge TN" onSelect={(l) => chooseSpot(l, l.label)} />
      )}
      {mode === 'map' && <p className="muted">Tap the map where the place is.</p>}

      {(mode === 'map' || spot) && (
        <MapView
          height={220}
          pins={spot ? [{ ...spot, id: 'draft', title: name || 'New place', kind: 'draft' }] : []}
          onPick={mode === 'map' ? (p) => chooseSpot(p) : undefined}
        />
      )}

      {err && <p className="error">{err}</p>}

      {spot && (
        <form onSubmit={save} className="stack">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
          </label>
          <label>
            Type
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Why you want to go, hours, RV parking…" />
          </label>
          {address && <p className="muted small">{address}</p>}
          <div className="row">
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn primary" disabled={busy || !name.trim()}>Save to my list</button>
          </div>
        </form>
      )}
      {!spot && (
        <button className="btn link" onClick={onCancel}>Cancel</button>
      )}
    </section>
  )
}
