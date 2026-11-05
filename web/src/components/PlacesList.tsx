import { useState } from 'react'
import { directionsUrl } from '../lib/geo'
import { stars, type Summary } from '../lib/reviews'
import type { Place } from '../lib/supabase'
import { MapView } from './MapView'
import { StarSummary } from './Reviews'

type View = 'to-visit' | 'been'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export function PlacesList({
  places,
  addedBy,
  summaries = {},
  myRatings = {},
  onEdit,
  onRoute,
  onBeen,
  onUndoBeen,
  onRate,
  onDelete,
}: {
  places: Place[]
  addedBy?: (p: Place) => string | undefined
  summaries?: Record<string, Summary>
  myRatings?: Record<string, number>
  onEdit: (p: Place) => void
  onRoute: (ps: Place[]) => void
  onBeen: (p: Place) => void
  onUndoBeen: (p: Place) => void
  onRate: (p: Place) => void
  onDelete: (p: Place) => void
}) {
  const [view, setView] = useState<View>('to-visit')
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

  const toVisit = places.filter((p) => !p.visited)
  const been = places
    .filter((p) => p.visited)
    .sort((a, b) => (b.visited_at ?? b.created_at).localeCompare(a.visited_at ?? a.created_at))
  const shown = view === 'been' ? been : toVisit

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
      <div className="segmented two" role="tablist">
        <button role="tab" aria-selected={view === 'to-visit'} className={view === 'to-visit' ? 'on' : ''}
          onClick={() => { setView('to-visit'); stopSelecting() }}>To visit ({toVisit.length})</button>
        <button role="tab" aria-selected={view === 'been'} className={view === 'been' ? 'on' : ''}
          onClick={() => { setView('been'); stopSelecting() }}>Been there ({been.length})</button>
      </div>

      {shown.length > 0 && (
        <MapView
          pins={shown.map((p) => ({
            id: p.id, lat: p.lat, lng: p.lng, title: p.name,
            subtitle: view === 'been' ? `Visited ${fmtDate(p.visited_at)}` : (p.category ?? undefined),
            kind: p.visited ? 'visited' : 'place',
          }))}
        />
      )}

      {view === 'to-visit' && (
        <div className="list-head">
          <span>{toVisit.length} to visit</span>
          {!selecting && toVisit.length > 1 && (
            <button className="btn small" onClick={() => setSelecting(true)}>Route several…</button>
          )}
        </div>
      )}
      {view === 'been' && !been.length && (
        <p className="muted empty-tab">Nothing here yet. When you visit a place, tap <strong>Been</strong> and it moves here with the date — and you can rate it for other travelers.</p>
      )}
      {view === 'to-visit' && !toVisit.length && (
        <p className="muted empty-tab">You’ve been everywhere on this list! Add somewhere new, or look back at <button className="btn link small" onClick={() => setView('been')}>where you’ve been</button>.</p>
      )}
      {selecting && <p className="muted small select-hint">Tap the places you want to visit. Stopover will work out the best order.</p>}

      <ul className={`places ${selecting ? 'selecting' : ''}`}>
        {shown.map((p) => (
          <li key={p.id} className={selected.has(p.id) ? 'chosen-row' : ''}>
            {selecting && (
              <label className="include" aria-label={`Include ${p.name}`}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              </label>
            )}
            <button
              className="grow place-main"
              onClick={() => (selecting ? toggle(p.id) : onEdit(p))}
              aria-label={selecting ? `Select ${p.name}` : `Open ${p.name}`}
            >
              <div className="name">
                {p.name}
                {p.approximate && <span className="tag">approx. location</span>}
              </div>
              {view === 'been' && (
                <div className="small been-line">
                  ✓ Visited {fmtDate(p.visited_at)}
                  {myRatings[p.id] ? <> · <span className="stars">{stars(myRatings[p.id])}</span></> : null}
                </div>
              )}
              <div className="muted small">
                {[p.near, p.category, [p.city, p.state].filter(Boolean).join(', ') || p.address?.split(',').slice(-4, -2).join(',').trim(),
                  addedBy?.(p) ? `added by ${addedBy(p)}` : null].filter(Boolean).join(' · ')}
              </div>
              {view === 'to-visit' && <StarSummary s={summaries[p.id]} small />}
              {p.notes && <div className="notes">{p.notes}</div>}
            </button>
            {!selecting && (
              <div className="actions">
                {view === 'to-visit' ? (
                  <>
                    <a className="btn small" href={directionsUrl(p)} target="_blank" rel="noreferrer">{p.approximate ? 'Find' : 'Go'}</a>
                    <button className="btn small" onClick={() => onBeen(p)}>Been</button>
                  </>
                ) : (
                  <>
                    <button className="btn small" onClick={() => onRate(p)}>{myRatings[p.id] ? 'Review' : '★ Rate'}</button>
                    <button className="btn small" onClick={() => onUndoBeen(p)} aria-label={`Move ${p.name} back to To visit`}>Undo</button>
                  </>
                )}
                <button
                  className="btn small danger"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => confirm(`Remove "${p.name}" from your list?${p.visited ? ' You’ll lose the record that you’ve been there (your review stays).' : ''}`) && onDelete(p)}
                >
                  ✕
                </button>
              </div>
            )}
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
