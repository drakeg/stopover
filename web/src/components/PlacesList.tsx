import { useState } from 'react'
import { directionsUrl } from '../lib/geo'
import type { Place } from '../lib/supabase'
import { MapView } from './MapView'

export function PlacesList({
  places,
  onEdit,
  onToggleVisited,
  onDelete,
}: {
  places: Place[]
  onEdit: (p: Place) => void
  onToggleVisited: (p: Place) => void
  onDelete: (p: Place) => void
}) {
  const [showVisited, setShowVisited] = useState(false)
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
        {visitedCount > 0 && (
          <label className="toggle">
            <input type="checkbox" checked={showVisited} onChange={(e) => setShowVisited(e.target.checked)} />
            Show {visitedCount} visited
          </label>
        )}
      </div>
      <ul className="places">
        {shown.map((p) => (
          <li key={p.id} className={p.visited ? 'visited' : ''}>
            <button className="grow place-main" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>
              <div className="name">
                {p.name}
                {p.approximate && <span className="tag">approx. location</span>}
              </div>
              <div className="muted small">
                {[p.near, p.category, p.address?.split(',').slice(-4, -2).join(',').trim()].filter(Boolean).join(' · ')}
              </div>
              {p.notes && <div className="notes">{p.notes}</div>}
            </button>
            <div className="actions">
              <a className="btn small" href={directionsUrl(p)} target="_blank" rel="noreferrer">{p.approximate ? 'Find' : 'Go'}</a>
              <button className="btn small" onClick={() => onToggleVisited(p)}>{p.visited ? 'Undo' : 'Been'}</button>
              <button
                className="btn small danger"
                aria-label={`Delete ${p.name}`}
                onClick={() => confirm(`Remove "${p.name}" from your list?`) && onDelete(p)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
