import { useEffect, useState } from 'react'
import {
  deleteReview, myReview, PARKING, placeReviews, saveReview, stars,
  type MyReview, type Parking, type Review, type Summary,
} from '../lib/reviews'
import type { Place } from '../lib/supabase'

const today = () => new Date().toLocaleDateString('en-CA') // yyyy-mm-dd in local time
const fmt = (d: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

/** ★★★★☆ 4.3 (12) */
export function StarSummary({ s, small }: { s?: Summary; small?: boolean }) {
  if (!s?.count) return null
  return (
    <span className={`star-sum ${small ? 'small' : ''}`} aria-label={`${s.avg} out of 5 from ${s.count} review${s.count === 1 ? '' : 's'}`}>
      <span className="stars">{stars(s.avg)}</span> {s.avg.toFixed(1)} <span className="muted">({s.count})</span>
    </span>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="star-picker" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  )
}

/**
 * Rate a place you've been to: stars, RV parking, cost, notes, and the date you went.
 * Shown as an overlay after tapping "Been", or from "Rate" / "Edit review".
 */
export function ReviewSheet({ place, onClose }: {
  place: Place
  onClose: (result?: { visited_on: string | null }) => void
}) {
  const [existing, setExisting] = useState<MyReview | null | undefined>(undefined)
  const [rating, setRating] = useState(0)
  const [parking, setParking] = useState<Parking | null>(null)
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(place.visited_at ? place.visited_at.slice(0, 10) : today())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    myReview(place.id).then((r) => {
      setExisting(r)
      if (r) {
        setRating(r.rating); setParking(r.parking); setCost(r.cost ?? ''); setNote(r.note ?? '')
        if (r.visited_on) setDate(r.visited_on)
      }
    }).catch(() => setExisting(null))
  }, [place.id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!rating) return setErr('Tap a star rating first.')
    setBusy(true); setErr(null)
    try {
      await saveReview(place, { rating, parking, cost, note, visited_on: date || null }, existing?.id)
      onClose({ visited_on: date || null })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function remove() {
    if (!existing || !confirm('Delete your review of this place?')) return
    setBusy(true)
    try { await deleteReview(existing.id); onClose() } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="sheet card stack" onSubmit={save} aria-label={`Review ${place.name}`}>
        <h2>How was {place.name}?</h2>
        {existing === undefined ? <p className="muted">Loading…</p> : (
          <>
            <StarPicker value={rating} onChange={setRating} />
            <div className="field">
              <span className="field-label">Parking for an RV</span>
              <div className="chips">
                {(Object.keys(PARKING) as Parking[]).map((k) => (
                  <button key={k} type="button" className={parking === k ? 'chip on' : 'chip'} onClick={() => setParking(parking === k ? null : k)}>
                    {PARKING[k]}
                  </button>
                ))}
              </div>
            </div>
            <label>
              Cost <span className="muted small">(optional)</span>
              <input value={cost} onChange={(e) => setCost(e.target.value)} maxLength={60} placeholder="e.g. Free, $15/adult, $10 parking" />
            </label>
            <label>
              Notes <span className="muted small">(optional)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000}
                placeholder="Where to park, how long to allow, dog-friendly, worth the detour?" />
            </label>
            <label>
              Visited on
              <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <p className="muted small">
              {place.approximate
                ? 'This place’s pin is where you were on the road, so your review stays private until you move the pin to the place itself.'
                : 'Your rating and notes are shared with other Stopover travelers, shown with your first name.'}
            </p>
            {err && <p className="error">{err}</p>}
            <div className="row">
              <button type="button" className="btn" onClick={() => onClose()} disabled={busy}>{existing ? 'Cancel' : 'Skip'}</button>
              <button className="btn primary grow" disabled={busy}>{busy ? 'Saving…' : existing ? 'Update review' : 'Save review'}</button>
            </div>
            {existing && <button type="button" className="btn link small danger" onClick={remove} disabled={busy}>Delete my review</button>}
          </>
        )}
      </form>
    </div>
  )
}

/** What other travelers said about this place. */
export function PlaceReviews({ place, refreshKey, onReview }: { place: Place; refreshKey?: number; onReview?: () => void }) {
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    setReviews(null); setErr(false)
    placeReviews(place).then(setReviews).catch(() => setErr(true))
  }, [place.id, place.lat, place.lng, place.name, place.osm_id, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const avg = reviews?.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0
  const mine = reviews?.find((r) => r.mine)

  return (
    <section className="card stack reviews">
      <div className="trip-summary">
        <h2 style={{ margin: 0 }}>Traveler reviews</h2>
        {!!reviews?.length && <StarSummary s={{ avg: Math.round(avg * 10) / 10, count: reviews.length }} />}
      </div>
      {place.approximate && !place.osm_id && (
        <p className="muted small">This pin is where you were on the road, so we can’t match it to other travelers’ reviews yet. Move the pin to the place itself (above) to see them.</p>
      )}
      {err && <p className="muted small">Couldn’t load reviews right now.</p>}
      {reviews && !reviews.length && !place.approximate && <p className="muted">No reviews yet{place.visited ? ' — be the first.' : '.'}</p>}
      {onReview && place.visited && (
        <button className="btn" onClick={onReview}>{mine ? 'Edit my review' : '★ Rate this place'}</button>
      )}
      {!!reviews?.length && (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.id}>
              <div className="review-head">
                <span className="stars">{stars(r.rating)}</span>
                <strong>{r.mine ? 'You' : r.reviewer}</strong>
                <span className="muted small">{fmt(r.visited_on ?? r.created_at)}</span>
              </div>
              {(r.parking || r.cost) && (
                <div className="review-facts small">
                  {r.parking && <span className="fact">🅿︎ {PARKING[r.parking]}</span>}
                  {r.cost && <span className="fact">💲 {r.cost}</span>}
                </div>
              )}
              {r.note && <p className="review-note">{r.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
