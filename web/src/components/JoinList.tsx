import { useEffect, useState } from 'react'
import { acceptInvite, inviteInfo, movePlaces, type InviteInfo, type List } from '../lib/lists'

/** Shown after following an invite link. */
export function JoinList({ code, current, currentCount, onJoined, onDone }: {
  code: string
  current: List | null // the list the user has open now, offered as "bring my places"
  currentCount: number
  onJoined: (listId: string, moved: number) => void
  onDone: () => void
}) {
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [bring, setBring] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    inviteInfo(code).then(setInfo).catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [code])

  async function join() {
    setBusy(true); setErr(null)
    try {
      const listId = await acceptInvite(code)
      const moved = bring && current && currentCount > 0 && current.id !== listId ? await movePlaces(current.id, listId) : 0
      onJoined(listId, moved)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const canBring = current && currentCount > 0 && current.member_count === 1

  return (
    <section className="card stack join">
      <h2>Shared list invite</h2>
      {!info && !err && <p className="muted">Checking the invite…</p>}
      {info?.status === 'ok' && (
        <>
          <p>
            <strong>{info.inviter}</strong> invited you to share the list <strong>“{info.list_name}”</strong>
            {' '}({info.place_count} place{info.place_count === 1 ? '' : 's'}).
          </p>
          <p className="muted small">You’ll both see the same places, and anything either of you adds or changes shows up for the other.</p>
          {canBring && (
            <label className="toggle">
              <input type="checkbox" checked={bring} onChange={(e) => setBring(e.target.checked)} />
              Also move my {currentCount} saved place{currentCount === 1 ? '' : 's'} from “{current.name}” into it
            </label>
          )}
          {err && <p className="error">{err}</p>}
          <div className="row">
            <button className="btn" onClick={onDone} disabled={busy}>Not now</button>
            <button className="btn primary grow" onClick={join} disabled={busy}>{busy ? 'Joining…' : `Join “${info.list_name}”`}</button>
          </div>
        </>
      )}
      {info?.status === 'member' && (
        <>
          <p>You’re already on <strong>“{info.list_name}”</strong>.</p>
          <button className="btn primary" onClick={() => onJoined(info.list_id!, 0)}>Open it</button>
        </>
      )}
      {info && ['used', 'expired', 'invalid'].includes(info.status) && (
        <>
          <p>
            {info.status === 'used' && 'This invite link has already been used.'}
            {info.status === 'expired' && 'This invite link has expired.'}
            {info.status === 'invalid' && 'This invite link isn’t valid.'}
            {' '}Invite links work once and last 7 days — ask {info.inviter ?? 'whoever sent it'} for a new one.
          </p>
          <button className="btn" onClick={onDone}>Continue</button>
        </>
      )}
      {err && !info && (
        <>
          <p className="error">{err}</p>
          <button className="btn" onClick={onDone}>Continue</button>
        </>
      )}
    </section>
  )
}
