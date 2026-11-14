import { useCallback, useEffect, useState } from 'react'
import {
  adminReports, adminSuspended, resolveReport, setReviewHidden, unsuspend,
  type AdminReport, type ResolveAction, type Suspended,
} from '../lib/moderation'

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

/** Admin only: reports from users, and accounts that are suspended. */
export function Moderation({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<'open' | 'resolved'>('open')
  const [reports, setReports] = useState<AdminReport[] | null>(null)
  const [suspended, setSuspended] = useState<Suspended[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const [r, s] = await Promise.all([adminReports(view), adminSuspended()])
      setReports(r); setSuspended(s)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [view])
  useEffect(() => { setReports(null); load() }, [load])

  async function act(r: AdminReport, action: ResolveAction) {
    let note: string | undefined
    if (action === 'suspend') {
      const n = prompt(`Suspend ${r.reported_name}? They’ll keep their lists but can’t post reviews, check in or message, and their reviews and check-ins disappear for others.\n\nReason (kept on record):`, r.reason ?? '')
      if (n === null) return
      note = n
    }
    setBusy(r.id)
    try { await resolveReport(r.id, action, note); await load() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key)
    try { await fn(); await load() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }

  return (
    <>
      <button className="btn link" onClick={onClose}>‹ Back to account</button>
      <section className="card stack">
        <h2>Moderation</h2>
        <div className="segmented two" role="tablist">
          <button role="tab" aria-selected={view === 'open'} className={view === 'open' ? 'on' : ''} onClick={() => setView('open')}>Open reports</button>
          <button role="tab" aria-selected={view === 'resolved'} className={view === 'resolved' ? 'on' : ''} onClick={() => setView('resolved')}>Resolved</button>
        </div>
        {err && <p className="error">{err}</p>}
        {reports === null && <p className="muted">Loading…</p>}
        {reports?.length === 0 && <p className="muted">{view === 'open' ? 'Nothing to review. 🎉' : 'No resolved reports yet.'}</p>}
        <ul className="reports">
          {reports?.map((r) => (
            <li key={r.id} className="report">
              <div className="report-head">
                <span className="tag">{r.kind}</span>
                <span className="muted small">{fmt(r.created_at)} · reported by {r.reporter}</span>
              </div>
              <div>
                <strong>{r.reported_name}</strong>
                {r.reported_email && <span className="muted small"> · {r.reported_email}</span>}
                {r.reported_suspended && <span className="tag danger-tag">suspended</span>}
                {r.reports_against > 1 && <span className="muted small"> · {r.reports_against} reports in total</span>}
              </div>
              {r.content && <blockquote className="report-content">{r.content}{r.review_hidden ? ' (hidden)' : ''}</blockquote>}
              {r.reason && <p className="small"><strong>Reason:</strong> {r.reason}</p>}
              {r.status === 'open' ? (
                <div className="row wrap">
                  <button className="btn small" disabled={busy === r.id} onClick={() => act(r, 'dismiss')}>Dismiss</button>
                  {r.review_id && !r.review_hidden && (
                    <button className="btn small" disabled={busy === r.id} onClick={() => act(r, 'hide-review')}>Hide review</button>
                  )}
                  {!r.reported_suspended && (
                    <button className="btn small danger" disabled={busy === r.id} onClick={() => act(r, 'suspend')}>Suspend {r.reported_name.split(' ')[0]}</button>
                  )}
                </div>
              ) : (
                <p className="muted small">
                  {r.status === 'dismissed' ? 'Dismissed' : 'Actioned'} {fmt(r.resolved_at)}{r.resolution ? ` — ${r.resolution}` : ''}
                  {r.review_id && r.review_hidden && (
                    <> · <button className="btn link small" disabled={busy === r.id} onClick={() => run(r.id, () => setReviewHidden(r.review_id!, false))}>Un-hide review</button></>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <h2>Suspended accounts</h2>
        {suspended.length === 0 && <p className="muted small">None.</p>}
        <ul className="people">
          {suspended.map((s) => (
            <li key={s.user_id}>
              <span className="grow">
                {s.name}{s.email && <span className="muted small"> · {s.email}</span>}
                <span className="muted small"> · since {fmt(s.created_at)}{s.reason ? ` — ${s.reason}` : ''}</span>
              </span>
              <button className="btn link small" disabled={busy === s.user_id}
                onClick={() => confirm(`Lift the suspension for ${s.name}?`) && run(s.user_id, () => unsuspend(s.user_id))}>Lift</button>
            </li>
          ))}
        </ul>
        <p className="muted small">Reports also arrive from conversations (Report in the ••• menu) and from reviews.</p>
      </section>
    </>
  )
}
