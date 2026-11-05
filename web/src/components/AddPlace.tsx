import { useEffect, useMemo, useRef, useState } from 'react'
import { reverseGeocode, type LatLng } from '../lib/geo'
import { getCurrentLocation, type Fix } from '../lib/location'
import { compass, findByName, findNearby, matchName, searchWords, type NearbyPlace } from '../lib/nearby'
import { CATEGORIES, type NewPlace, type Place } from '../lib/supabase'
import { checkDuplicates, findDuplicates, placesNear, type DuplicateHit } from '../lib/duplicates'
import type { List } from '../lib/lists'
import { DuplicateWarning } from './DuplicateWarning'
import { LocationSearch } from './LocationSearch'
import { MapView } from './MapView'

type Gps = { status: 'locating' } | { status: 'ok'; pos: Fix } | { status: 'error'; msg: string }
type Lookup = { status: 'idle' | 'loading' | 'error'; items: NearbyPlace[] } | { status: 'ok'; items: NearbyPlace[] }

const SHOW = 5

function whereLabel(p: NearbyPlace): string {
  const d = p.distanceMi < 0.2 ? 'right here' : `${p.distanceMi < 10 ? p.distanceMi.toFixed(1) : Math.round(p.distanceMi)} mi`
  if (d === 'right here') return d
  return p.relative ? `${d} ${p.relative}` : `${d} ${compass(p.bearing)}`
}

/**
 * Quick add: built for a co-pilot at highway speed. Location is grabbed the
 * moment this opens (so it's where you saw the sign, not a mile later), and the
 * only thing to type is what the sign said. Nearby attractions load in the
 * background; tapping one saves its exact spot instead of the road.
 */
type AddProps = { onSave: (p: NewPlace) => Promise<void>; onCancel: () => void; lists: List[]; onOpenExisting: (p: Place) => void }

export function AddPlace({ onSave, onCancel, lists, onOpenExisting }: AddProps) {
  const [precise, setPrecise] = useState(false)
  const [gps, setGps] = useState<Gps>({ status: 'locating' })
  const gpsPromise = useRef<Promise<Fix> | null>(null)
  const [name, setName] = useState('')
  const [near, setNear] = useState('')
  const [picked, setPicked] = useState<NearbyPlace | null>(null)
  const [nearby, setNearby] = useState<Lookup>({ status: 'idle', items: [] })
  const [byName, setByName] = useState<Lookup>({ status: 'idle', items: [] })
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dups, setDups] = useState<DuplicateHit[] | null>(null)
  const [saved, setSaved] = useState<Place[]>([]) // already in your lists, near here

  useEffect(() => {
    const ctrl = new AbortController()
    const p = getCurrentLocation()
    gpsPromise.current = p
    p.then(
      (pos) => {
        setGps({ status: 'ok', pos })
        placesNear(pos.lat, pos.lng).then(setSaved).catch(() => {})
        setNearby({ status: 'loading', items: [] })
        findNearby(pos, ctrl.signal).then(
          (items) => setNearby({ status: 'ok', items }),
          (e) => { if (e?.name !== 'AbortError') setNearby({ status: 'error', items: [] }) },
        )
      },
      (e) => setGps({ status: 'error', msg: e instanceof Error ? e.message : String(e) }),
    )
    return () => ctrl.abort()
  }, [])

  const words = searchWords(name).join(' ')
  const localMatches = useMemo(() => (words ? matchName(nearby.items, words) : nearby.items), [nearby.items, words])

  // Nothing nearby matches what she typed? Look further out by name (debounced, one request at a time).
  useEffect(() => {
    if (picked || !words || gps.status !== 'ok' || nearby.status === 'loading' || localMatches.length) {
      setByName({ status: 'idle', items: [] })
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setByName({ status: 'loading', items: [] })
      findByName(gps.pos, words, 50, ctrl.signal).then(
        (items) => setByName({ status: 'ok', items }),
        (e) => { if (e?.name !== 'AbortError') setByName({ status: 'error', items: [] }) },
      )
    }, 900)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [words, picked, gps, nearby.status, localMatches.length])

  const suggestions = localMatches.length ? localMatches : byName.items
  const shown = suggestions.slice(0, showAll ? 12 : SHOW)

  function pick(p: NearbyPlace) {
    setPicked(p)
    setName(p.name)
  }

  /** Which of your saved places a suggestion already is (for the "Saved" / "Been" badges). */
  const savedAs = (p: NearbyPlace) => findDuplicates({ name: p.name, lat: p.lat, lng: p.lng, osm_id: p.id }, saved)[0]?.place

  async function quickSave(e?: React.FormEvent, force = false) {
    e?.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const place: NewPlace = picked
        ? { name: name.trim(), near: near.trim() || null, lat: picked.lat, lng: picked.lng, approximate: false, category: picked.category, osm_id: picked.id }
        : await gpsPromise.current!.then((pos) => ({ name: name.trim(), near: near.trim() || null, lat: pos.lat, lng: pos.lng, approximate: true }))
      if (!force) {
        const hits = await checkDuplicates(place)
        if (hits.length) { setDups(hits); setBusy(false); return }
      }
      await onSave(place)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  if (precise) return <PreciseAdd initialName={name} initialNear={near} onSave={onSave} onCancel={onCancel} lists={lists} onOpenExisting={onOpenExisting} />

  const lookingUp = nearby.status === 'loading' || byName.status === 'loading'

  return (
    <section className="card">
      <h2>Quick add</h2>
      <form onSubmit={quickSave} className="stack">
        <label>
          What did the sign say?
          <input
            className="big-input"
            value={name}
            onChange={(e) => { setName(e.target.value); if (picked && e.target.value !== picked.name) setPicked(null) }}
            placeholder="e.g. Manhattan Project Historic Site"
            autoFocus
            required
            maxLength={200}
            autoCapitalize="words"
            enterKeyHint="done"
          />
        </label>

        {picked ? (
          <div className="picked">
            <span>✓ Saving the exact spot: <strong>{picked.kind}</strong>, {whereLabel(picked)}</span>
            <button type="button" className="btn link small" onClick={() => setPicked(null)}>Undo</button>
          </div>
        ) : (
          gps.status === 'ok' && (
            <div className="suggest" aria-live="polite">
              <div className="suggest-head muted small">
                {words ? 'Matches nearby' : 'Nearby — tap if it’s the one'}
                {lookingUp && <span> · looking…</span>}
              </div>
              {shown.length > 0 && (
                <ul className="suggest-list">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => pick(p)}>
                        <span className="name">
                          {p.name}
                          {(() => {
                            const mine = savedAs(p)
                            return mine ? <span className={`tag ${mine.visited ? 'been' : ''}`}>{mine.visited ? 'been there' : 'saved'}</span> : null
                          })()}
                        </span>
                        <span className="muted small">{p.kind} · {whereLabel(p)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!lookingUp && suggestions.length > SHOW && !showAll && (
                <button type="button" className="btn link small" onClick={() => setShowAll(true)}>Show more</button>
              )}
              {!lookingUp && !shown.length && (
                <p className="muted small">
                  {nearby.status === 'error' || byName.status === 'error'
                    ? 'Couldn’t look up nearby places right now. Just type the name and save.'
                    : words ? 'No match nearby — that’s fine, type the name and save.' : 'Nothing listed nearby. Type the name and save.'}
                </p>
              )}
            </div>
          )
        )}

        <label>
          <span>Where? <span className="muted small">(optional)</span></span>
          <input value={near} onChange={(e) => setNear(e.target.value)} placeholder="e.g. I-40 exit 356" enterKeyHint="done" />
        </label>

        {!picked && (
          <p className={`gps ${gps.status}`}>
            {gps.status === 'locating' && '📍 Getting your location…'}
            {gps.status === 'ok' && '📍 Location captured — saving it right where you are'}
            {gps.status === 'error' && `⚠️ ${gps.msg}`}
          </p>
        )}

        {err && <p className="error">{err}</p>}
        {dups ? (
          <DuplicateWarning hits={dups} lists={lists} busy={busy} onOpen={onOpenExisting}
            onSaveAnyway={() => quickSave(undefined, true)} onBack={() => setDups(null)} />
        ) : gps.status === 'error' && !picked ? (
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
function PreciseAdd({ initialName, initialNear, onSave, onCancel, lists, onOpenExisting }: {
  initialName: string; initialNear: string } & AddProps) {
  const [dups, setDups] = useState<DuplicateHit[] | null>(null)
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

  async function save(e?: React.FormEvent, force = false) {
    e?.preventDefault()
    if (!spot || !name.trim()) return
    setBusy(true)
    try {
      const place: NewPlace = {
        name: name.trim(), lat: spot.lat, lng: spot.lng, near: near.trim() || null,
        address: address || null, category: category || null, notes: notes.trim() || null, approximate: false,
      }
      if (!force) {
        const hits = await checkDuplicates(place)
        if (hits.length) { setDups(hits); setBusy(false); return }
      }
      await onSave(place)
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
        {dups ? (
          <DuplicateWarning hits={dups} lists={lists} busy={busy} onOpen={onOpenExisting}
            onSaveAnyway={() => save(undefined, true)} onBack={() => setDups(null)} />
        ) : (
          <div className="row">
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn primary" disabled={busy || !spot || !name.trim()}>{spot ? 'Save to my list' : 'Tap the map first'}</button>
          </div>
        )}
      </form>
    </section>
  )
}
