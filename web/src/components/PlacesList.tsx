import { useState } from 'react'
import { directionsUrl } from '../lib/geo'
import type { Place } from '../lib/supabase'
import { MapView } from './MapView'

export function PlacesList({
  places,
  addedBy,
  onEdit,
  onRoute,
  onToggleVisited,
  onDelete,
}: {
  places: Place[]
  addedBy?: (p: Place) => string | undefined
  onEdit: (p: Place) => void
  onRoute: (ps: Place[]) => void
  onToggleVisited: (p: Place) => void
  onDelete: (p: Place) => void
}) {
  const [showVisited, setShowVisited] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()) }
  const shown = places.filter((p) => showVisited || !p.visited)
  const visitedCount = places.filter((p) => p.visited).length

  if (places.length === 0) {
    return (
      <section className="empty">
        <p>No places yet.</p>
        <p className="muted">Next time you pass something worth a stop, tap <strong>Add a place</strong>, type what the sign says, and hit Save.</p>
      </section>
    )
  }

  return (
    <>
      <MapView
        pins={shown.map((p) => ({
          id: p.id, lat: p.lat, lng: p.lng, title: p.name,
          subtitle: p.category ?? undefined, kind: p.visited ? 'visited' : 'place',
        }))}
      />
      <div className="list-head">
        <span>{places.length - visitedCount} to visit</span>
        <span className="row">
          {visitedCount > 0 && (
            <label className="toggle">
              <input type="checkbox" checked={showVisited} onChange={(e) => setShowVisited(e.target.checked)} />
              Show {visitedCount} visited
            </label>
          )}
          {!selecting && places.length > 1 && (
            <button className="btn small" onClick={() => setSelecting(true)}>Route several…</button>
          )}
        </span>
      </div>
      {selecting && <p className="muted small select-hint">Tap the places you want to visit. Stopover will work out the best order.</p>}
      <ul className={`places ${selecting ? 'selecting' : ''}`}>
        {shown.map((p) => (
          <li key={p.id} className={[p.visited ? 'visited' : '', selected.has(p.id) ? 'chosen-row' : ''].join(' ')}>
            {selecting && (
              <label className="include" aria-label={`Include ${p.name}`}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              </label>
            )}
            <button
              className="grow place-main"
              onClick={() => (selecting ? toggle(p.id) : onEdit(p))}
              aria-label={selecting ? `Select ${p.name}` : `Edit ${p.name}`}
            >
              <div className="name">
                {p.name}
                {p.approximate && <span className="tag">approx. location</span>}
              </div>
              <div className="muted small">
                {[p.near, p.category, [p.city, p.state].filter(Boolean).join(', ') || p.address?.split(',').slice(-4, -2).join(',').trim(),
                  addedBy?.(p) ? `added by ${addedBy(p)}` : null].filter(Boolean).join(' · ')}
              </div>
              {p.notes && <div className="notes">{p.notes}</div>}
            </button>
            {!selecting && <div className="actions">
              <a className="btn small" href={directionsUrl(p)} target="_blank" rel="noreferrer">{p.approximate ? 'Find' : 'Go'}</a>
              <button className="btn small" onClick={() => onToggleVisited(p)}>{p.visited ? 'Undo' : 'Been'}</button>
              <button
                className="btn small danger"
                aria-label={`Delete ${p.name}`}
                onClick={() => confirm(`Remove "${p.name}" from your list?`) && onDelete(p)}
              >
                ✕
              </button>
            </div>}
          </li>
        ))}
      </ul>
      {selecting && (
        <div className="select-bar">
          <button className="btn" onClick={stopSelecting}>Cancel</button>
          <button className="btn primary grow" disabled={selected.size === 0}
            onClick={() => { onRoute(places.filter((p) => selected.has(p.id))); stopSelecting() }}>
            {selected.size ? `Plan route · ${selected.size} place${selected.size > 1 ? 's' : ''}` : 'Select places'}
          </button>
        </div>
      )}
    </>
  )
}
