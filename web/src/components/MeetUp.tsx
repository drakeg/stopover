import { useCallback, useEffect, useState } from 'react'
import {
  acceptFriendInvite, createFriendInvite, endCheckin, friendInviteInfo, friendsPlans, myCheckins, myConversations, myFriends, removeFriend, VISIBILITY, whenLabel,
  type Checkin, type Conversation, type Friend, type FriendPlan,
} from '../lib/social'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.round(m / 60)}h`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** The Meet up tab: your check-ins, friends' plans, messages, and friends. */
export function MeetUp({ onOpenChat, onOpenPlaceByCheckin, refreshKey }: {
  onOpenChat: (c: { other_id: string; first_name: string; checkin_id?: string | null }) => void
  onOpenPlaceByCheckin: (c: Checkin) => void
  refreshKey: number
}) {
  const [mine, setMine] = useState<Checkin[] | null>(null)
  const [plans, setPlans] = useState<FriendPlan[] | null>(null)
  const [convos, setConvos] = useState<Conversation[] | null>(null)
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [invite, setInvite] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const safe = <T,>(p: Promise<T>, fallback: T) => p.catch((e) => { setErr(e instanceof Error ? e.message : String(e)); return fallback })
    const [a, b, c, d] = await Promise.all([
      safe(myCheckins(), []), safe(friendsPlans(), []), safe(myConversations(), []), safe(myFriends(), []),
    ])
    setMine(a); setPlans(b); setConvos(c); setFriends(d)
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  async function share() {
    try {
      const url = invite ?? (await createFriendInvite())
      setInvite(url)
      const text = 'Be my friend on Stopover so we can see each other’s travel plans and meet up:'
      if (typeof navigator.share === 'function') {
        try { await navigator.share({ title: 'Stopover friend invite', text, url }); return } catch { /* cancelled */ }
      }
      await navigator.clipboard.writeText(url)
      setCopied(true); setTimeout(() => setCopied(false), 2500)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  const hereNow = plans?.filter((p) => p.kind === 'here') ?? []
  const upcoming = plans?.filter((p) => p.kind === 'going') ?? []

  return (
    <>
      {err && <p className="error banner" onClick={() => setErr(null)}>{err}</p>}

      <section className="card stack">
        <h2>Messages</h2>
        {convos === null && <p className="muted">Loading…</p>}
        {convos?.length === 0 && <p className="muted small">No messages yet. When you and another traveler are at the same place, tap <strong>Message</strong> on their check-in.</p>}
        {!!convos?.length && (
          <ul className="convos">
            {convos.map((c) => (
              <li key={c.other_id}>
                <button onClick={() => onOpenChat({ other_id: c.other_id, first_name: c.first_name })}>
                  <span className="grow">
                    <span className="name">{c.first_name}{c.rig && <span className="muted small"> · {c.rig}</span>}</span>
                    <span className={`small ${c.unread ? '' : 'muted'}`}>{c.last_from_me ? 'You: ' : ''}{c.last_body}</span>
                  </span>
                  <span className="convo-meta">
                    <span className="muted small">{ago(c.last_at)}</span>
                    {c.unread > 0 && <span className="badge">{c.unread}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack">
        <h2>Your check-ins</h2>
        {mine?.length === 0 && <p className="muted small">Open any place and tap <strong>I’m here</strong> or <strong>I’m going</strong>.</p>}
        {!!mine?.length && (
          <ul className="plans">
            {mine.map((c) => (
              <li key={c.id}>
                <button className="grow plan-main" onClick={() => onOpenPlaceByCheckin(c)}>
                  <span className="name">{c.name}</span>
                  <span className="small">{c.kind === 'here' ? '📍 ' : '📅 '}{whenLabel(c)} · <span className="muted">{VISIBILITY[c.visibility].label}</span></span>
                </button>
                <button className="btn small" onClick={async () => { await endCheckin(c); load() }}>{c.kind === 'here' ? 'I’ve left' : 'Cancel plan'}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack">
        <h2>Friends’ plans</h2>
        {plans?.length === 0 && <p className="muted small">When friends check in or plan a visit and share it with friends, it shows up here.</p>}
        {[['Here now', hereNow], ['Coming up', upcoming]].map(([label, rows]) =>
          (rows as FriendPlan[]).length ? (
            <div key={label as string} className="field">
              <span className="field-label">{label as string}</span>
              <ul className="plans">
                {(rows as FriendPlan[]).map((p) => (
                  <li key={p.checkin_id}>
                    <div className="grow">
                      <div><strong>{p.first_name}</strong> <span className="muted small">{whenLabel(p)}</span></div>
                      <div className="small">{p.place_name}</div>
                      {p.note && <div className="small muted">“{p.note}”</div>}
                    </div>
                    <button className="btn small" onClick={() => onOpenChat({ other_id: p.user_id, first_name: p.first_name, checkin_id: p.checkin_id })}>Message</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </section>

      <section className="card stack">
        <h2>Friends</h2>
        <p className="muted small">Friends can see check-ins you share with “Friends”. People on your shared lists count as friends automatically.</p>
        {!!friends?.length && (
          <ul className="people">
            {friends.map((f) => (
              <li key={f.user_id}>
                <span className="grow">
                  {f.first_name}{f.rig && <span className="muted small"> · {f.rig}</span>}
                  {!!f.shared_lists.length && <span className="muted small"> · on “{f.shared_lists.join('”, “')}”</span>}
                </span>
                {f.via_invite && (
                  <button className="btn link small danger"
                    onClick={async () => { if (confirm(`Remove ${f.first_name} as a friend?`)) { await removeFriend(f.user_id); load() } }}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button className="btn primary" onClick={share}>{copied ? 'Link copied ✓' : 'Invite a friend'}</button>
        {invite && (
          <>
            <input readOnly value={invite} onFocus={(e) => e.target.select()} aria-label="Friend invite link" />
            <span className="muted small">Works once, for 7 days.</span>
          </>
        )}
      </section>
    </>
  )
}

/** Shown after following a friend invite link. */
export function JoinFriend({ code, onDone }: { code: string; onDone: (msg?: string) => void }) {
  const [info, setInfo] = useState<{ inviter: string | null; status: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    friendInviteInfo(code).then(setInfo).catch((e) => setErr(String(e?.message ?? e)))
  }, [code])
  async function accept() {
    setBusy(true)
    try {
      const name = await acceptFriendInvite(code)
      onDone(`You and ${name} are now friends on Stopover.`)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  return (
    <section className="card stack join">
      <h2>Friend invite</h2>
      {!info && !err && <p className="muted">Checking the invite…</p>}
      {info?.status === 'ok' && (
        <>
          <p><strong>{info.inviter}</strong> wants to be friends on Stopover.</p>
          <p className="muted small">Friends can see the check-ins and plans each of you share with “Friends”, and message each other.</p>
          <div className="row">
            <button className="btn" onClick={() => onDone()} disabled={busy}>Not now</button>
            <button className="btn primary grow" onClick={accept} disabled={busy}>{busy ? 'One moment…' : `Accept ${info.inviter}`}</button>
          </div>
        </>
      )}
      {info && info.status !== 'ok' && (
        <>
          <p>
            {info.status === 'friends' && `You and ${info.inviter} are already friends.`}
            {info.status === 'self' && 'That’s your own invite link — send it to a friend.'}
            {info.status === 'used' && 'This invite link has already been used. Ask for a new one.'}
            {info.status === 'expired' && 'This invite link has expired. Ask for a new one.'}
            {info.status === 'invalid' && 'This invite link isn’t valid.'}
          </p>
          <button className="btn" onClick={() => onDone()}>Continue</button>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </section>
  )
}
