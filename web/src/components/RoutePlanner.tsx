import { useEffect, useState } from 'react'
import { formatDuration, formatMiles, getRouteVia, reverseGeocode, tripLinks, type Located, type MapsApp, type Route } from '../lib/geo'
import { getCurrentLocation } from '../lib/location'
import { planOrder, type EndMode } from '../lib/optimize'
import type { Place } from '../lib/supabase'
import { MapView, type MapPin } from './MapView'
import { Endpoint } from './TripPlanner'

type Result = { ordered: Place[]; route: Route | null; usedDriveTimes: boolean }

/** Pick several saved places → best order from real drive times → open in Maps. */
export function RoutePlanner({ initial, mapsFirst, onClose }: { initial: Place[]; mapsFirst: MapsApp; onClose: () => void }) {
  const [stops, setStops] = useState(initial)
  const [start, setStart] = useState<Located | null>(null)
  const [locating, setLocating] = useState(true)
  const [endMode, setEndMode] = useState<EndMode>('last-stop')
  const [dest, setDest] = useState<Located | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Start from where you are, if the device will say.
  useEffect(() => {
    getCurrentLocation()
      .then(async (p) => {
        const r = await reverseGeocode(p).catch(() => null)
        setStart((cur) => cur ?? { ...p, label: r ? `Current location (${[r.city, r.state].filter(Boolean).join(', ')})` : 'Current location' })
      })
      .catch(() => {})
      .finally(() => setLocating(false))
  }, [])

  const ready = start && stops.length > 0 && (endMode !== 'fixed' || dest)

  // Re-plan whenever the inputs change.
  useEffect(() => {
    if (!ready) { setResult(null); return }
    const ctrl = new AbortController()
    setBusy(true); setErr(null)
    ;(async () => {
      const plan = await planOrder(start!, stops, endMode, dest ?? undefined, ctrl.signal)
      const via = [start!, ...plan.ordered, ...(endMode === 'back-to-start' ? [start!] : endMode === 'fixed' && dest ? [dest] : [])]
      const route = await getRouteVia(via).catch(() => null)
      if (!ctrl.signal.aborted) setResult({ ...plan, route })
    })()
      .catch((e) => { if (e?.name !== 'AbortError') setErr(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!ctrl.signal.aborted) setBusy(false) })
    return () => ctrl.abort()
  }, [ready, start, stops, endMode, dest])

  const ordered = result?.ordered ?? []
  const asStops = (ps: Place[]) => ps.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name }))
  const legsFor = (app: MapsApp) => {
    if (!start || !ordered.length) return []
    if (endMode === 'back-to-start') return tripLinks(start, asStops(ordered), { ...start, name: 'Start' }, app)
    if (endMode === 'fixed' && dest) return tripLinks(start, asStops(ordered), dest, app)
    const last = ordered[ordered.length - 1]
    return tripLinks(start, asStops(ordered.slice(0, -1)), { lat: last.lat, lng: last.lng, name: last.name }, app)
  }

  const pins: MapPin[] = [
    ...(start ? [{ ...start, id: 'start', title: 'Start', subtitle: start.label, kind: 'endpoint' as const }] : []),
    ...(endMode === 'fixed' && dest ? [{ ...dest, id: 'end', title: 'Destination', subtitle: dest.label, kind: 'endpoint' as const }] : []),
    ...(ordered.length ? ordered : stops).map((p, i) => ({
      id: p.id, lat: p.lat, lng: p.lng, title: ordered.length ? `${i + 1}. ${p.name}` : p.name, kind: 'stop' as const,
    })),
  ]

  return (
    <>
      <button className="btn link" onClick={onClose}>‹ Back to my places</button>
      <section className="card stack">
        <h2>Route {stops.length} place{stops.length === 1 ? '' : 's'}</h2>
        {locating && !start && <p className="muted small">📍 Getting your location…</p>}
        <Endpoint label="Starting from" value={start} onChange={setStart} allowHere />
        <div className="field">
          <span className="field-label">Ending</span>
          <div className="chips">
            {([['last-stop', 'At the last stop'], ['back-to-start', 'Back to start'], ['fixed', 'Somewhere else']] as const).map(([m, label]) => (
              <button key={m} type="button" className={endMode === m ? 'chip on' : 'chip'} onClick={() => setEndMode(m)}>{label}</button>
            ))}
          </div>
        </div>
        {endMode === 'fixed' && <Endpoint label="Heading to" value={dest} onChange={setDest} />}
        {!start && !locating && <p className="muted small">Choose a starting point to work out the order.</p>}
      </section>

      <section className="card stack">
        <div className="trip-summary">
          <h3 style={{ margin: 0 }}>{busy ? 'Working out the best order…' : ordered.length ? 'Best order' : 'Stops'}</h3>
          {result?.route && !busy && (
            <span className="small"><strong>{formatMiles(result.route.distanceMi)} mi</strong> · {formatDuration(result.route.durationMin)}</span>
          )}
        </div>
        <MapView pins={pins} route={result?.route?.coords} height={300} />
        {err && <p className="error">{err}</p>}
        {result && !result.usedDriveTimes && (
          <p className="muted small">Couldn’t reach the drive-time service, so this order uses straight-line distance. It’s usually close.</p>
        )}
        <ol className="stops">
          {(ordered.length ? ordered : stops).map((p) => (
            <li key={p.id}>
              <div className="grow">
                <div className="name">{p.name}{p.approximate && <span className="tag">approx.</span>}</div>
                <div className="muted small">{[p.city, p.state].filter(Boolean).join(', ') || p.near || ''}</div>
              </div>
              {stops.length > 1 && (
                <button className="btn small danger" aria-label={`Remove ${p.name} from this route`}
                  onClick={() => setStops((s) => s.filter((x) => x.id !== p.id))}>✕</button>
              )}
            </li>
          ))}
        </ol>
        {ordered.some((p) => p.approximate) && (
          <p className="muted small">Places marked approx. are routed to where you saved them (the road), not the place itself.</p>
        )}

        {ordered.length > 0 && !busy && (
          <div className="trip-go stack">
            <strong>Open this route in:</strong>
            {(mapsFirst === 'apple' ? (['apple', 'google'] as MapsApp[]) : (['google', 'apple'] as MapsApp[])).map((app) => {
              const legs = legsFor(app)
              const appName = app === 'apple' ? 'Apple Maps' : 'Google Maps'
              return legs.length === 1 ? (
                <a key={app} className={`btn wide big ${app === mapsFirst ? 'primary' : ''}`} href={legs[0].url} target="_blank" rel="noreferrer">{appName}</a>
              ) : (
                <div key={app} className="stack">
                  <span className="muted small">{appName} (in {legs.length} parts):</span>
                  {legs.map((l, i) => (
                    <a key={i} className={`btn wide ${app === mapsFirst ? 'primary' : ''}`} href={l.url} target="_blank" rel="noreferrer">Part {i + 1}: {l.label}</a>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
