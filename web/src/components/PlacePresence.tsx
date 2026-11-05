import { useCallback, useEffect, useState } from 'react'
import { getCurrentLocation } from '../lib/location'
import { distanceMi } from '../lib/nearby'
import {
  checkIn, endCheckin, myCheckins, setCheckinVisibility, VISIBILITY, whenLabel, whoIsAt, HERE_HOURS,
  type Checkin, type Presence, type Visibility,
} from '../lib/social'
import type { LatLng } from '../lib/geo'
import type { Place } from '../lib/supabase'

const today = () => new Date().toLocaleDateString('en-CA')
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <div className="field">
      <span className="field-label">Who can see this?</span>
      <div className="chips">
        {(Object.keys(VISIBILITY) as Visibility[]).map((v) => (
          <button key={v} type="button" className={value === v ? 'chip on' : 'chip'} onClick={() => onChange(v)}>{VISIBILITY[v].label}</button>
        ))}
      </div>
      <span className="muted small">{VISIBILITY[value].help}</span>
    </div>
  )
}

/** "I'm here" / "I'm going" at this place, and who else is. */
export function PlacePresence({ place, defaultVisibility, onFixPin, onMessage, onChanged }: {
  place: Place
  defaultVisibility: Visibility
  onFixPin: (p: LatLng) => Promise<void>
  onMessage: (who: { user_id: string; first_name: string; checkin_id: string }) => void
  onChanged?: () => void
}) {
  const [others, setOthers] = useState<Presence[] | null>(null)
  const [mine, setMine] = useState<Checkin[]>([])
  const [mode, setMode] = useState<'here' | 'going' | null>(null)
  const [date, setDate] = useState(() => new Date(Date.now() + 86400e3).toLocaleDateString('en-CA'))
  const [note, setNote] = useState('')
  const [vis, setVis] = useState<Visibility>(defaultVisibility)
  const [fixPin, setFixPin] = useState(true)
  const [here, setHere] = useState<{ pos: LatLng; mi: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [o, m] = await Promise.all([whoIsAt(place).catch(() => [] as Presence[]), myCheckins().catch(() => [] as Checkin[])])
    setOthers(o.filter((x) => !x.mine))
    setMine(m.filter((c) => c.place_id === place.id))
  }, [place])
  useEffect(() => { load() }, [load])

  async function startHere() {
    setMode('here'); setErr(null); setLocating(true); setHere(null)
    try {
      const pos = await getCurrentLocation()
      setHere({ pos, mi: distanceMi(pos, place) })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setLocating(false) }
  }

  async function confirm() {
    setBusy(true); setErr(null)
    try {
      let p = place
      if (mode === 'here' && place.approximate && here && fixPin) {
        await onFixPin(here.pos) // the pin was where you saw the sign; now you're actually here
        p = { ...place, lat: here.pos.lat, lng: here.pos.lng, approximate: false }
      }
      await checkIn(p, { kind: mode!, date, note, visibility: vis })
      setMode(null); setNote('')
      await load(); onChanged?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function end(c: Checkin) {
    setBusy(true)
    try { await endCheckin(c); await load(); onChanged?.() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  async function changeVis(c: Checkin, v: Visibility) {
    try { await setCheckinVisibility(c.id, v); await load() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  const myHere = mine.find((c) => c.kind === 'here')
  const myGoing = mine.filter((c) => c.kind === 'going')
  const tooFar = here && here.mi > 2
  const canMatch = !place.approximate || place.osm_id

  return (
    <section className="card stack presence">
      <div>
        <h2 style={{ margin: 0 }}>{place.name}</h2>
        <span className="muted small">Meet up here · details and reviews below</span>
      </div>

      {myHere && (
        <div className="my-checkin">
          <div className="grow">
            <strong>📍 You’re here</strong> <span className="muted small">until {time(myHere.ends_at)}</span>
            {myHere.note && <div className="small">“{myHere.note}”</div>}
            <select className="vis-select" value={myHere.visibility} onChange={(e) => changeVis(myHere, e.target.value as Visibility)} aria-label="Who can see">
              {(Object.keys(VISIBILITY) as Visibility[]).map((v) => <option key={v} value={v}>Visible to: {VISIBILITY[v].label}</option>)}
            </select>
          </div>
          <button className="btn small" onClick={() => end(myHere)} disabled={busy}>I’ve left</button>
        </div>
      )}
      {myGoing.map((c) => (
        <div className="my-checkin" key={c.id}>
          <div className="grow">
            <strong>📅 You’re {whenLabel(c)}</strong>
            {c.note && <div className="small">“{c.note}”</div>}
            <select className="vis-select" value={c.visibility} onChange={(e) => changeVis(c, e.target.value as Visibility)} aria-label="Who can see">
              {(Object.keys(VISIBILITY) as Visibility[]).map((v) => <option key={v} value={v}>Visible to: {VISIBILITY[v].label}</option>)}
            </select>
          </div>
          <button className="btn small" onClick={() => end(c)} disabled={busy}>Cancel plan</button>
        </div>
      ))}

      {!mode && (
        <div className="row">
          {!myHere && <button className="btn primary grow" onClick={startHere}>📍 I’m here</button>}
          <button className="btn grow" onClick={() => { setMode('going'); setErr(null) }}>📅 I’m going…</button>
        </div>
      )}

      {mode && (
        <div className="checkin-form stack">
          {mode === 'here' && (
            <>
              {locating && <p className="muted small">📍 Checking where you are…</p>}
              {here && !tooFar && <p className="ok small">You’re {here.mi < 0.1 ? 'right here' : `${here.mi.toFixed(1)} mi from the pin`}. Checked in for {HERE_HOURS} hours, or until you tap “I’ve left”.</p>}
              {tooFar && <p className="warn small">Your location is about {Math.round(here!.mi)} mi from this place’s pin. Check in anyway?</p>}
              {place.approximate && here && (
                <label className="toggle">
                  <input type="checkbox" checked={fixPin} onChange={(e) => setFixPin(e.target.checked)} />
                  Also move this place’s pin to where I am now (it was saved from the road)
                </label>
              )}
            </>
          )}
          {mode === 'going' && (
            <label>
              Which day?
              <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} required />
            </label>
          )}
          <label>
            Note <span className="muted small">(optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140}
              placeholder={mode === 'here' ? 'e.g. White Tiffin in the back lot, here till 3' : 'e.g. Arriving around 2pm'} />
          </label>
          <VisibilityPicker value={vis} onChange={setVis} />
          {err && <p className="error">{err}</p>}
          <div className="row">
            <button className="btn" onClick={() => setMode(null)} disabled={busy}>Cancel</button>
            <button className="btn primary grow" onClick={confirm} disabled={busy || (mode === 'here' && locating) || (mode === 'going' && !date)}>
              {busy ? 'Saving…' : mode === 'here' ? 'Check in' : 'Add to my plans'}
            </button>
          </div>
        </div>
      )}
      {!mode && err && <p className="error">{err}</p>}

      <div className="field">
        <span className="field-label">Other travelers</span>
        {!canMatch && <p className="muted small">This pin is where you were on the road, so we can’t match it to other travelers yet. Check in here (it can fix the pin) or move the pin above.</p>}
        {canMatch && others === null && <p className="muted small">Looking…</p>}
        {canMatch && others?.length === 0 && <p className="muted small">No one you can see is here or planning to come. Check-ins only show to people their owner chose.</p>}
        {!!others?.length && (
          <ul className="people-here">
            {others.map((o) => (
              <li key={o.checkin_id}>
                <div className="grow">
                  <div><strong>{o.first_name}</strong>{o.rig && <span className="muted"> · {o.rig}</span>}{o.is_friend && <span className="tag been">friend</span>}</div>
                  <div className="small">{o.kind === 'here' ? '📍 ' : '📅 '}{whenLabel(o)}</div>
                  {o.note && <div className="small muted">“{o.note}”</div>}
                </div>
                <button className="btn small" onClick={() => onMessage({ user_id: o.user_id, first_name: o.first_name, checkin_id: o.checkin_id })}>Message</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
