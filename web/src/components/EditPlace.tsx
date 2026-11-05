import { useState } from 'react'
import { directionsUrl, reverseGeocode, type LatLng } from '../lib/geo'
import { CATEGORIES, type Place, type PlacePatch } from '../lib/supabase'
import type { List } from '../lib/lists'
import { PlaceReviews } from './Reviews'
import { LocationSearch } from './LocationSearch'
import { MapView } from './MapView'

/** Tidy up a place later: rename, add details, move the pin to the exact spot. */
export function EditPlace({ place, lists = [], addedBy, reviewsKey, onReview, onSave, onCancel, children }: {
  place: Place; lists?: List[]; addedBy?: string; reviewsKey?: number; onReview?: () => void; children?: React.ReactNode
  onSave: (patch: PlacePatch) => Promise<void>; onCancel: () => void
}) {
  const [spot, setSpot] = useState<LatLng>({ lat: place.lat, lng: place.lng })
  const [moved, setMoved] = useState(false)
  const [name, setName] = useState(place.name)
  const [near, setNear] = useState(place.near ?? '')
  const [category, setCategory] = useState(place.category ?? '')
  const [notes, setNotes] = useState(place.notes ?? '')
  const [address, setAddress] = useState(place.address ?? '')
  const [approximate, setApproximate] = useState(place.approximate)
  const [listId, setListId] = useState(place.list_id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function move(p: LatLng, label?: string) {
    setSpot(p)
    setMoved(true)
    setApproximate(false)
    if (label) setAddress(label)
    else {
      const r = await reverseGeocode(p).catch(() => null)
      if (r) setAddress(r.address)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSave({
        name: name.trim(), near: near.trim() || null, category: category || null, notes: notes.trim() || null,
        approximate, ...(listId !== place.list_id ? { list_id: listId } : {}), ...(moved ? { lat: spot.lat, lng: spot.lng, address: address || null } : {}),
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <>
    {children}
    <section className="card">
      <h2>{place.name}</h2>
      {place.visited && (
        <p className="ok small" style={{ marginTop: '-.4rem' }}>
          ✓ You’ve been here{place.visited_at ? ` · ${new Date(place.visited_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
        </p>
      )}
      {addedBy && <p className="muted small" style={{ marginTop: '-.4rem' }}>Added by {addedBy}</p>}
      <form onSubmit={save} className="stack">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} /></label>
        <label>Where<input value={near} onChange={(e) => setNear(e.target.value)} placeholder="e.g. I-40 exit 356" /></label>
        <label>
          Type
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Why you want to go, hours, RV parking…" /></label>

        <div>
          <strong>Location</strong>
          <p className="muted small">
            {approximate
              ? 'Saved from the road, so the pin is where you were, not the place itself. Tap the map to move it, or find it in your maps app and paste its link or coordinates below.'
              : 'Tap the map to move the pin.'}
          </p>
          {approximate && (
            <a className="btn small" href={directionsUrl({ ...place, name })} target="_blank" rel="noreferrer">Find “{name}” in Maps ↗</a>
          )}
          <LocationSearch placeholder="Paste coordinates or a maps link, or search" onSelect={(l) => move(l, l.label || undefined)} />
          <MapView height={260} pins={[{ ...spot, id: 'edit', title: name, kind: 'draft' }]} onPick={(p) => move(p)} />
          <p className="muted small">
            {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
            {moved && <strong className="ok"> · new location — tap Save changes to keep it</strong>}
          </p>
          {address && <p className="muted small">{address}</p>}
          <label className="toggle">
            <input type="checkbox" checked={approximate} onChange={(e) => setApproximate(e.target.checked)} />
            Location is approximate
          </label>
        </div>

        {lists.length > 1 && (
          <label>
            List
            <select value={listId} onChange={(e) => setListId(e.target.value)}>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.member_count > 1 ? ' (shared)' : ''}</option>)}
            </select>
          </label>
        )}
        {err && <p className="error">{err}</p>}
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={busy || !name.trim()}>Save changes</button>
        </div>
      </form>
    </section>
    <PlaceReviews place={place} refreshKey={reviewsKey} onReview={onReview} />
    </>
  )
}
