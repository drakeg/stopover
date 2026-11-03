import { useEffect, useMemo, useState } from 'react'
import { download, placesToCsv, placesToGpx } from '../lib/exporters'
import {
  categoryOptions, EMPTY_QUERY, queryPlaces, regionKey, regionName, regionOptions,
  type PlaceQuery, type SortKey, type Status,
} from '../lib/placeQuery'
import type { Place } from '../lib/supabase'

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

const QUERY_KEY = 'stopover.savedPlacesQuery'

/** Searchable, filterable, sortable list of everything the user has saved. */
export function SavedPlaces({ places, listName, onEdit }: { places: Place[]; listName?: string; onEdit: (p: Place) => void }) {
  // Remembered for this browser session, so filters survive opening a place to edit it.
  const [q, setQ] = useState<PlaceQuery>(() => {
    try { return { ...EMPTY_QUERY, ...JSON.parse(sessionStorage.getItem(QUERY_KEY) ?? '{}') } } catch { return EMPTY_QUERY }
  })
  useEffect(() => {
    try { sessionStorage.setItem(QUERY_KEY, JSON.stringify(q)) } catch { /* storage unavailable: fine */ }
  }, [q])
  const set = <K extends keyof PlaceQuery>(k: K, v: PlaceQuery[K]) => setQ((prev) => ({ ...prev, [k]: v }))

  const results = useMemo(() => queryPlaces(places, q), [places, q])
  const regions = useMemo(() => regionOptions(places), [places])
  const categories = useMemo(() => categoryOptions(places), [places])
  const filtered = JSON.stringify({ ...q, sort: '' }) !== JSON.stringify({ ...EMPTY_QUERY, sort: '' })
  const noState = places.filter((p) => !p.state).length
  const stamp = new Date().toISOString().slice(0, 10)

  return (
    <section className="card stack saved">
      <h2>{listName ? `Places in “${listName}”` : 'Saved places'} <span className="muted">({places.length})</span></h2>
      {places.length === 0 ? (
        <p className="muted">Nothing saved yet.</p>
      ) : (
        <>
          <input
            type="search"
            placeholder="Search names, notes, towns, exits…"
            value={q.text}
            onChange={(e) => set('text', e.target.value)}
            aria-label="Search saved places"
          />
          <div className="filters">
            <label>
              State
              <select value={q.region} onChange={(e) => set('region', e.target.value)}>
                <option value="">All states</option>
                {regions.map((r) => <option key={r.key} value={r.key}>{r.label} ({r.count})</option>)}
              </select>
            </label>
            <label>
              Type
              <select value={q.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">All types</option>
                {categories.map((c) => <option key={c.key} value={c.key}>{c.key} ({c.count})</option>)}
              </select>
            </label>
            <label>
              Show
              <select value={q.status} onChange={(e) => set('status', e.target.value as Status)}>
                <option value="all">All</option>
                <option value="to-visit">Still to visit</option>
                <option value="visited">Been there</option>
              </select>
            </label>
            <label>
              Sort
              <select value={q.sort} onChange={(e) => set('sort', e.target.value as SortKey)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
                <option value="state">State, then town</option>
              </select>
            </label>
          </div>
          <div className="row spread wrap">
            <label className="toggle">
              <input type="checkbox" checked={q.approximateOnly} onChange={(e) => set('approximateOnly', e.target.checked)} />
              Only approximate pins
            </label>
            {filtered && <button className="btn link small" onClick={() => setQ({ ...EMPTY_QUERY, sort: q.sort })}>Clear filters</button>}
          </div>

          <div className="row spread wrap result-head">
            <span className="muted small" role="status">
              {filtered ? `${results.length} of ${places.length} places` : `${places.length} places`}
            </span>
            {results.length > 0 && (
              <span className="small">
                Download {filtered ? 'these' : 'all'}:{' '}
                <button className="btn link small" onClick={() => download(`stopover-${stamp}.gpx`, placesToGpx(results), 'application/gpx+xml')}>GPX</button>
                {' · '}
                <button className="btn link small" onClick={() => download(`stopover-${stamp}.csv`, placesToCsv(results), 'text/csv')}>CSV</button>
              </span>
            )}
          </div>
          {noState > 0 && <p className="muted small">Looking up the state for {noState} place{noState === 1 ? '' : 's'}…</p>}

          {results.length === 0 ? (
            <p className="muted">No places match. <button className="btn link small" onClick={() => setQ(EMPTY_QUERY)}>Clear filters</button></p>
          ) : (
            <ul className="saved-list">
              {results.map((p) => {
                const where = [p.city, regionKey(p) ? regionName(regionKey(p)) : null].filter(Boolean).join(', ')
                return (
                  <li key={p.id}>
                    <button className="saved-row" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}>
                      <span className="saved-main">
                        <span className="name">
                          {p.name}
                          {p.approximate && <span className="tag">approx.</span>}
                          {p.visited && <span className="tag been">been</span>}
                        </span>
                        <span className="muted small">{[where || p.near || 'Location pending', p.category].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="saved-date muted small">
                        {p.visited && p.visited_at ? `Visited ${fmtDate(p.visited_at)}` : `Saved ${fmtDate(p.created_at)}`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
