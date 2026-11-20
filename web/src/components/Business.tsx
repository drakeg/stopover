import { useCallback, useEffect, useState } from 'react'
import {
  adminBusinesses, businessAt, businessStats, claimBusiness, deleteBusiness, featureBusiness, featuredNearRoute,
  HOOKUPS, myBusinesses, reviewBusiness, rvFacts, updateBusiness,
  type AdminBusiness, type BusinessAt, type BusinessEdits, type BusinessInfo, type BusinessStats, type BusinessStatus,
  type FeaturedStop, type Hookups, type MyBusiness,
} from '../lib/businesses'
import { directionsUrl, formatMiles, type LatLng } from '../lib/geo'
import type { Place } from '../lib/supabase'
import { CONTACT_URL } from './Legal'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const featuredNow = (iso: string | null) => !!iso && Date.parse(iso) > Date.now()
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')

/** The facts a business published: offer, RV details, contact. */
export function BusinessDetails({ b }: { b: BusinessInfo }) {
  const facts = rvFacts(b)
  return (
    <div className="business-details stack">
      {b.offer && <p className="offer">🎁 {b.offer}</p>}
      {b.description && <p className="small">{b.description}</p>}
      {facts.length > 0 && <p className="small">{facts.join(' · ')}</p>}
      {(b.website || b.phone) && (
        <p className="small">
          {b.website && <a href={b.website} target="_blank" rel="noreferrer nofollow">Website</a>}
          {b.website && b.phone && ' · '}
          {b.phone && <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a>}
        </p>
      )}
    </div>
  )
}

/** On a place (render with key={place.id}): the verified business profile if there is one, otherwise a quiet "claim it" link. */
export function PlaceBusiness({ place }: { place: Place }) {
  const [biz, setBiz] = useState<BusinessAt | null | undefined>(undefined)
  const [claiming, setClaiming] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let live = true
    businessAt(place).then((b) => live && setBiz(b)).catch(() => live && setBiz(null))
    return () => { live = false }
  }, [place])

  if (biz === undefined) return null
  if (biz && biz.status === 'verified') {
    return (
      <section className="card stack business">
        <h3>
          {biz.name} <span className="tag verified" title="Stopover checked that this listing is run by the business">✓ Verified business</span>
          {biz.mine && <span className="muted small"> · yours</span>}
        </h3>
        <BusinessDetails b={biz} />
        {biz.mine && <p className="muted small">Edit your listing under Account → My business.</p>}
      </section>
    )
  }
  if (biz?.mine && biz.status === 'rejected') {
    return (
      <section className="card stack business">
        <p className="small">Your claim for this place wasn’t approved. See Account → My business for details.</p>
      </section>
    )
  }
  if (biz?.mine || sent) {
    return (
      <section className="card stack business">
        <p className="small"><strong>Your claim is waiting for review.</strong> We’ll verify it, usually within a couple of days, and your listing will appear here.</p>
      </section>
    )
  }
  return (
    <section className="card stack business">
      {!claiming ? (
        <p className="muted small">
          Own or manage this place?{' '}
          <button className="btn link small" onClick={() => setClaiming(true)}>Claim it</button> to add RV details and an offer for travelers.
        </p>
      ) : (
        <ClaimForm place={place} onCancel={() => setClaiming(false)} onDone={() => { setClaiming(false); setSent(true) }} />
      )}
    </section>
  )
}

function ClaimForm({ place, onCancel, onDone }: { place: Place; onCancel: () => void; onDone: () => void }) {
  const [role, setRole] = useState('')
  const [website, setWebsite] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await claimBusiness(place, { claimant_role: role, claim_note: note, website, phone }); onDone() }
    catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  if (place.approximate) {
    return (
      <p className="small">
        This place’s pin is approximate. Move it to the exact spot first (search for the business above), then claim it.{' '}
        <button className="btn link small" onClick={onCancel}>OK</button>
      </p>
    )
  }
  return (
    <form className="stack" onSubmit={submit}>
      <h3>Claim {place.name}</h3>
      <p className="muted small">
        Verified businesses get a ✓ badge, can list RV details and an offer, and see how many travelers saved or plan to visit them.
        Free to claim. We check every claim, usually by calling the phone number listed for the business.
      </p>
      <label>Your role<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Owner, manager…" required maxLength={80} /></label>
      <label>Business website<input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" inputMode="url" maxLength={300} /></label>
      <label>Business phone<input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" required maxLength={30} /></label>
      <label>Anything that helps us verify you <span className="muted small">(optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} />
      </label>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={busy || !role.trim() || !phone.trim()}>{busy ? 'Sending…' : 'Send claim'}</button>
      </div>
    </form>
  )
}

// ---------- Account: the owner's listing ----------
export function MyBusinessCard() {
  const [list, setList] = useState<MyBusiness[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => myBusinesses().then(setList).catch((e) => setErr(errText(e))), [])
  useEffect(() => { load() }, [load])

  if (!list?.length) return err ? <section className="card"><p className="error">{err}</p></section> : null
  return (
    <section className="card stack">
      <h2>My business</h2>
      {list.map((b) => <OwnedBusiness key={b.id} b={b} onChanged={load} />)}
    </section>
  )
}

const STATUS: Record<BusinessStatus, string> = { pending: 'Waiting for review', verified: '✓ Verified', rejected: 'Not approved' }

function OwnedBusiness({ b, onChanged }: { b: MyBusiness; onChanged: () => void }) {
  const [stats, setStats] = useState<BusinessStats | null>(null)
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (b.status === 'verified') businessStats(b.id).then(setStats).catch(() => setStats(null)) }, [b.id, b.status])
  const featured = featuredNow(b.featured_until)

  return (
    <div className="owned-business stack">
      <div className="report-head">
        <strong>{b.name}</strong>
        <span className={`tag ${b.status === 'verified' ? 'verified' : b.status === 'rejected' ? 'danger-tag' : ''}`}>{STATUS[b.status]}</span>
      </div>
      {b.review_note && <p className="small"><strong>Note from Stopover:</strong> {b.review_note}</p>}
      {b.status === 'verified' && stats && (
        <ul className="stats" aria-label="Traveler interest">
          <li><strong>{stats.saved}</strong><span>saved it</span></li>
          <li><strong>{stats.going}</strong><span>plan to visit</span></li>
          <li><strong>{stats.here_now}</strong><span>here now</span></li>
          <li><strong>{stats.reviews}</strong><span>{stats.avg_rating ? `reviews · ★ ${stats.avg_rating}` : 'reviews'}</span></li>
        </ul>
      )}
      {b.status === 'verified' && (
        <p className="muted small">
          {featured
            ? <>⭐ Featured on travelers’ routes until {day(b.featured_until)}.</>
            : <>Want travelers planning trips past you to see your offer? <a href={CONTACT_URL} target="_blank" rel="noreferrer">Ask about Featured</a>.</>}
        </p>
      )}
      {b.status !== 'rejected' && (editing
        ? <BusinessForm b={b} onDone={() => { setEditing(false); onChanged() }} />
        : (
          <>
            <BusinessDetails b={b} />
            <div className="row wrap">
              <button className="btn small" onClick={() => setEditing(true)}>Edit listing</button>
              <button className="btn small danger" onClick={async () => {
                if (!confirm(`Remove your listing for ${b.name}? Travelers will no longer see your details or offer.`)) return
                await deleteBusiness(b.id).catch(() => undefined); onChanged()
              }}>Remove</button>
            </div>
          </>
        ))}
      {b.status === 'rejected' && (
        <button className="btn small" onClick={async () => { await deleteBusiness(b.id).catch(() => undefined); onChanged() }}>Dismiss</button>
      )}
    </div>
  )
}

const tri = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no')
const fromTri = (s: string) => (s === '' ? null : s === 'yes')

function BusinessForm({ b, onDone }: { b: MyBusiness; onDone: () => void }) {
  const [f, setF] = useState<BusinessEdits>({
    name: b.name, category: b.category, description: b.description, website: b.website, phone: b.phone,
    max_rig_ft: b.max_rig_ft, big_rig_parking: b.big_rig_parking, hookups: b.hookups, pets: b.pets, offer: b.offer,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (patch: BusinessEdits) => setF((x) => ({ ...x, ...patch }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await updateBusiness(b.id, f); onDone() } catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  return (
    <form className="stack" onSubmit={save}>
      <label>Business name<input value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} required maxLength={120} /></label>
      <label>What you are<input value={f.category ?? ''} onChange={(e) => set({ category: e.target.value })} placeholder="Campground, diner, museum…" maxLength={40} /></label>
      <label>Offer for Stopover travelers <span className="muted small">(optional)</span>
        <input value={f.offer ?? ''} onChange={(e) => set({ offer: e.target.value })} placeholder="10% off a night with this screen" maxLength={140} />
      </label>
      <label>About<textarea value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} rows={3} maxLength={1000} /></label>
      <div className="row wrap">
        <label className="grow">Longest rig you fit (ft)
          <input type="number" min={10} max={80} value={f.max_rig_ft ?? ''} onChange={(e) => set({ max_rig_ft: e.target.value ? Number(e.target.value) : null })} />
        </label>
        <label className="grow">Big-rig parking
          <select value={tri(f.big_rig_parking ?? null)} onChange={(e) => set({ big_rig_parking: fromTri(e.target.value) })}>
            <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
          </select>
        </label>
      </div>
      <div className="row wrap">
        <label className="grow">Hookups
          <select value={f.hookups ?? ''} onChange={(e) => set({ hookups: (e.target.value || null) as Hookups | null })}>
            <option value="">— (not a campground)</option>
            {(Object.keys(HOOKUPS) as Hookups[]).map((h) => <option key={h} value={h}>{HOOKUPS[h]}</option>)}
          </select>
        </label>
        <label className="grow">Pets
          <select value={tri(f.pets ?? null)} onChange={(e) => set({ pets: fromTri(e.target.value) })}>
            <option value="">—</option><option value="yes">Welcome</option><option value="no">Not allowed</option>
          </select>
        </label>
      </div>
      <label>Website<input value={f.website ?? ''} onChange={(e) => set({ website: e.target.value })} inputMode="url" maxLength={300} /></label>
      <label>Phone<input value={f.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} type="tel" maxLength={30} /></label>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button className="btn primary" disabled={busy || !f.name?.trim()}>{busy ? 'Saving…' : 'Save listing'}</button>
      </div>
    </form>
  )
}

// ---------- Trip planner: featured businesses near the route ----------
export function FeaturedAlongRoute({ coords, maxMi, skipNear }: { coords: [number, number][]; maxMi: number; skipNear: LatLng[] }) {
  const [stops, setStops] = useState<FeaturedStop[]>([])
  const skipKey = skipNear.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  useEffect(() => {
    let live = true
    featuredNearRoute(coords, maxMi, skipNear).then((s) => live && setStops(s)).catch(() => live && setStops([]))
    return () => { live = false }
    // skipKey stands in for skipNear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, maxMi, skipKey])

  if (!stops.length) return null
  return (
    <section className="card stack featured">
      <h3>Featured along your route <span className="tag">Sponsored</span></h3>
      <p className="muted small">Verified businesses that pay to be shown to travelers passing by.</p>
      <ul className="stops plain">
        {stops.slice(0, 5).map(({ business: b, milesFromStart, offRouteMi }) => (
          <li key={b.id}>
            <div className="grow">
              <div className="name">{b.name} <span className="tag verified">✓</span></div>
              <div className="muted small">
                Mile {formatMiles(milesFromStart)} · about {formatMiles(offRouteMi)} mi off route{b.category ? ` · ${b.category}` : ''}
              </div>
              <BusinessDetails b={b} />
            </div>
            <a className="btn small" href={directionsUrl(b)} target="_blank" rel="noreferrer">Go</a>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------- Admin ----------
export function BusinessAdmin() {
  const [view, setView] = useState<BusinessStatus>('pending')
  const [rows, setRows] = useState<AdminBusiness[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    setErr(null)
    try { setRows(await adminBusinesses(view)) } catch (e) { setErr(errText(e)) }
  }, [view])
  useEffect(() => { setRows(null); load() }, [load])

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id)
    try { await fn(); await load() } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  function decide(b: AdminBusiness, action: 'verify' | 'reject') {
    const note = prompt(action === 'verify'
      ? `Verify ${b.name}? Note for the owner (optional):`
      : `Reject the claim for ${b.name}? Tell the owner why:`, '')
    if (note === null) return
    run(b.id, () => reviewBusiness(b.id, action, note))
  }
  function feature(b: AdminBusiness) {
    const d = prompt(`Feature ${b.name} on travelers’ routes for how many more days? (0 stops featuring)`, '30')
    if (d === null) return
    const days = Number(d)
    if (!Number.isInteger(days) || days < 0 || days > 400) { setErr('Days must be a whole number from 0 to 400.'); return }
    run(b.id, () => featureBusiness(b.id, days))
  }

  return (
    <section className="card stack">
      <h2>Business claims</h2>
      <div className="segmented" role="tablist">
        {(['pending', 'verified', 'rejected'] as BusinessStatus[]).map((s) => (
          <button key={s} role="tab" aria-selected={view === s} className={view === s ? 'on' : ''} onClick={() => setView(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
      {rows === null && <p className="muted">Loading…</p>}
      {rows?.length === 0 && <p className="muted small">None.</p>}
      <ul className="reports">
        {rows?.map((b) => (
          <li key={b.id} className="report">
            <div className="report-head">
              <strong>{b.name}</strong>
              <span className="muted small">{day(b.created_at)}</span>
            </div>
            <div className="small">
              {b.owner_name}{b.claimant_role ? ` (${b.claimant_role})` : ''}{b.owner_email && <span className="muted"> · {b.owner_email}</span>}
            </div>
            <div className="small">
              {b.phone && <><a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a> · </>}
              {b.website && <><a href={b.website} target="_blank" rel="noreferrer nofollow">{b.website}</a> · </>}
              <a href={directionsUrl({ lat: b.lat, lng: b.lng, name: b.name })} target="_blank" rel="noreferrer">Map</a>
            </div>
            {b.claim_note && <blockquote className="report-content">{b.claim_note}</blockquote>}
            {b.review_note && <p className="muted small">Note: {b.review_note}</p>}
            {featuredNow(b.featured_until) && <p className="small">⭐ Featured until {day(b.featured_until)}</p>}
            <div className="row wrap">
              {b.status !== 'verified' && <button className="btn small" disabled={busy === b.id} onClick={() => decide(b, 'verify')}>Verify</button>}
              {b.status !== 'rejected' && <button className="btn small danger" disabled={busy === b.id} onClick={() => decide(b, 'reject')}>Reject</button>}
              {b.status === 'verified' && <button className="btn small" disabled={busy === b.id} onClick={() => feature(b)}>Featured…</button>}
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">Verify by calling the business’s publicly listed number, not the one in the claim.</p>
    </section>
  )
}
