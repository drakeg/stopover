import { useMemo, useState } from 'react'
import {
  directionsUrl, formatDuration, formatMiles, getRoute, reverseGeocode, stopsAlongRoute, tripLinks,
  type Located, type Route,
} from '../lib/geo'
import { getCurrentLocation } from '../lib/location'
import { supabase, type Place, type Trip } from '../lib/supabase'
import { LocationSearch } from './LocationSearch'
import { MapView, type MapPin } from './MapView'

const DETOURS = [5, 10, 25, 50, 100]

function Endpoint({ label, value, onChange, allowHere }: {
  label: string; value: Located | null; onChange: (l: Located) => void; allowHere?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function here() {
    setBusy(true); setErr(null)
    try {
      const p = await getCurrentLocation()
      const r = await reverseGeocode(p).catch(() => null)
      onChange({ ...p, label: r ? `Current location (${r.address.split(',').slice(-4, -2).join(',').trim()})` : 'Current location' })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }
  return (
    <div className="endpoint">
      <div className="endpoint-head">
        <strong>{label}</strong>
        {allowHere && <button className="btn link" onClick={here} disabled={busy}>{busy ? 'Locating…' : '📍 Use my location'}</button>}
      </div>
      {value && <div className="chosen">{value.label}</div>}
      <LocationSearch
        placeholder="City, address or coordinates"
        onSelect={(l) => onChange({ ...l, label: l.label || `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}` })}
      />
      {err && <p className="error">{err}</p>}
    </div>
  )
}

export function TripPlanner({ places, trips, onTripsChanged }: {
  places: Place[]; trips: Trip[]; onTripsChanged: () => void
}) {
  const [start, setStart] = useState<Located | null>(null)
  const [end, setEnd] = useState<Located | null>(null)
  const [detour, setDetour] = useState(25)
  const [route, setRoute] = useState<Route | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())

  const stops = useMemo(
    () => (route ? stopsAlongRoute(places, route.coords, detour) : []),
    [route, places, detour],
  )
  const chosen = stops.filter((s) => !skipped.has(s.place.id))
  const legs = start && end && route
    ? tripLinks(start, chosen.map((s) => ({ lat: s.place.lat, lng: s.place.lng, name: s.place.name })), end)
    : []
  const toggleStop = (id: string) =>
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function plan(s = start, e = end) {
    if (!s || !e) return
    setBusy(true); setErr(null)
    try { setRoute(await getRoute(s, e)) }
    catch (x) { setErr(x instanceof Error ? x.message : 'Routing failed'); setRoute(null) }
    finally { setBusy(false) }
  }

  async function saveTrip() {
    if (!start || !end) return
    const name = prompt('Name this trip', `${start.label.split(',')[0]} → ${end.label.split(',')[0]}`)
    if (!name) return
    const { error } = await supabase.from('trips').insert({
      name, start_label: start.label, start_lat: start.lat, start_lng: start.lng,
      end_label: end.label, end_lat: end.lat, end_lng: end.lng, max_detour_mi: detour,
    })
    if (error) setErr(error.message)
    else onTripsChanged()
  }

  function loadTrip(t: Trip) {
    const s = { lat: t.start_lat, lng: t.start_lng, label: t.start_label }
    const e = { lat: t.end_lat, lng: t.end_lng, label: t.end_label }
    setStart(s); setEnd(e); setDetour(Number(t.max_detour_mi))
    plan(s, e)
  }

  async function deleteTrip(t: Trip) {
    if (!confirm(`Delete saved trip "${t.name}"?`)) return
    await supabase.from('trips').delete().eq('id', t.id)
    onTripsChanged()
  }

  const pins: MapPin[] = [
    ...(start ? [{ ...start, id: 'start', title: 'Start', subtitle: start.label, kind: 'endpoint' as const }] : []),
    ...(end ? [{ ...end, id: 'end', title: 'End', subtitle: end.label, kind: 'endpoint' as const }] : []),
    ...stops.map((s, i) => ({
      id: s.place.id, lat: s.place.lat, lng: s.place.lng, title: `${i + 1}. ${s.place.name}`,
      subtitle: `${formatMiles(s.milesFromStart)} mi in · ~${formatMiles(s.offRouteMi)} mi off route`, kind: 'stop' as const,
    })),
  ]

  return (
    <>
      {trips.length > 0 && !route && (
        <section className="card">
          <h2>Saved trips</h2>
          <ul className="trips">
            {trips.map((t) => (
              <li key={t.id}>
                <button className="grow trip-link" onClick={() => loadTrip(t)}>{t.name}</button>
                <button className="btn small danger" aria-label={`Delete ${t.name}`} onClick={() => deleteTrip(t)}>✕</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h2>Plan a trip</h2>
        <Endpoint label="Starting from" value={start} onChange={setStart} allowHere />
        <Endpoint label="Heading to" value={end} onChange={setEnd} />
        <label>
          How far off the route will you go?
          <div className="chips">
            {DETOURS.map((d) => (
              <button key={d} type="button" className={d === detour ? 'chip on' : 'chip'} onClick={() => setDetour(d)}>{d} mi</button>
            ))}
          </div>
        </label>
        <button className="btn primary wide" disabled={!start || !end || busy} onClick={() => plan()}>
          {busy ? 'Routing…' : 'Find stops along the way'}
        </button>
        {err && <p className="error">{err}</p>}
      </section>

      {route && (
        <section className="card">
          <div className="trip-summary">
            <span><strong>{formatMiles(route.distanceMi)} mi</strong> · {formatDuration(route.durationMin)} driving</span>
            <button className="btn small" onClick={saveTrip}>Save trip</button>
          </div>
          <MapView pins={pins} route={route.coords} height={360} />
          <h3>{stops.length ? `${stops.length} of your places along the way` : 'None of your places are near this route'}</h3>
          {!stops.length && <p className="muted">Try a wider detour distance, or add more places to your list.</p>}
          {stops.length > 0 && <p className="muted small">Uncheck any you'll skip this time.</p>}
          <ol className="stops">
            {stops.map((s) => (
              <li key={s.place.id} className={skipped.has(s.place.id) ? 'skipped' : ''}>
                <label className="include" aria-label={`Include ${s.place.name}`}>
                  <input type="checkbox" checked={!skipped.has(s.place.id)} onChange={() => toggleStop(s.place.id)} />
                </label>
                <div className="grow">
                  <div className="name">{s.place.name}</div>
                  <div className="muted small">
                    Mile {formatMiles(s.milesFromStart)} · about {formatMiles(s.offRouteMi)} mi off route
                    {s.place.near ? ` · ${s.place.near}` : ''}
                    {s.place.category ? ` · ${s.place.category}` : ''}
                  </div>
                  {s.place.notes && <div className="notes">{s.place.notes}</div>}
                </div>
                <a className="btn small" href={directionsUrl(s.place)} target="_blank" rel="noreferrer">{s.place.approximate ? 'Find' : 'Go'}</a>
              </li>
            ))}
          </ol>

          <div className="trip-go stack">
            {legs.length === 1 ? (
              <a className="btn primary wide big" href={legs[0].url} target="_blank" rel="noreferrer">
                Open trip in Maps{chosen.length ? ` (${chosen.length} stop${chosen.length > 1 ? 's' : ''})` : ''}
              </a>
            ) : (
              <>
                <p className="muted small">Maps links hold a few stops each, so this trip opens in {legs.length} parts:</p>
                {legs.map((l, i) => (
                  <a key={i} className="btn primary wide" href={l.url} target="_blank" rel="noreferrer">Part {i + 1}: {l.label}</a>
                ))}
              </>
            )}
            {chosen.some((s) => s.place.approximate) && (
              <p className="muted small">
                Stops marked approximate are routed to where you saved them, not the place itself. Tap the stop's Find
                button, or fix its pin under My places.
              </p>
            )}
          </div>
          <p className="muted small">“Off route” is straight-line distance; the actual side trip by road will be a bit longer.</p>
        </section>
      )}
    </>
  )
}
