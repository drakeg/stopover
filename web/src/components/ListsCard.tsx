import { useEffect, useState } from 'react'
import {
  createInvite, createList, deleteList, inviteUrl, leaveList, loadMembers, memberName, removeMember, renameList,
  type List, type Member,
} from '../lib/lists'

type Msg = { kind: 'ok' | 'error'; text: string } | null

/** Lists you belong to: switch, create, rename, share with an invite link, see people, leave or delete. */
export function ListsCard({ userId, lists, activeId, onSwitch, onChanged }: {
  userId: string
  lists: List[]
  activeId: string | null
  onSwitch: (id: string) => void
  onChanged: (switchTo?: string) => Promise<void> | void
}) {
  const active = lists.find((l) => l.id === activeId) ?? null
  const isOwner = active?.owner_id === userId
  const [members, setMembers] = useState<Member[]>([])
  const [name, setName] = useState(active?.name ?? '')
  const [newName, setNewName] = useState('')
  const [invite, setInvite] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const canShare = typeof navigator.share === 'function'

  useEffect(() => {
    setName(active?.name ?? '')
    setInvite(null)
    setMsg(null)
    if (active) loadMembers(active.id).then(setMembers).catch(() => setMembers([]))
  }, [active?.id, active?.name, active?.member_count]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true); setMsg(null)
    try {
      await fn()
      if (ok) setMsg({ kind: 'ok', text: ok })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  const makeInvite = () => run(async () => setInvite(inviteUrl((await createInvite(active!.id)).code)))

  async function shareInvite() {
    if (!invite || !active) return
    const text = `Join my Stopover list “${active.name}” so we can save and plan places together:`
    if (canShare) {
      try { await navigator.share({ title: 'Stopover list invite', text, url: invite }); return } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(invite)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setMsg({ kind: 'error', text: 'Couldn’t copy automatically — press and hold the link to copy it.' })
    }
  }

  return (
    <section className="card stack" id="lists">
      <h2>Lists</h2>
      <p className="muted small">Share a list so everyone on it sees the same places, kept in sync.</p>

      <ul className="list-picker">
        {lists.map((l) => (
          <li key={l.id}>
            <label className={l.id === activeId ? 'on' : ''}>
              <input type="radio" name="active-list" checked={l.id === activeId} onChange={() => onSwitch(l.id)} />
              <span className="grow">
                <span className="name">{l.name}</span>
                <span className="muted small"> · {l.member_count > 1 ? `shared, ${l.member_count} people` : 'just you'}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {active && (
        <div className="list-manage stack">
          <h3 style={{ margin: 0 }}>“{active.name}”</h3>

          {isOwner && (
            <form className="row" onSubmit={(e) => { e.preventDefault(); run(async () => { await renameList(active.id, name); await onChanged() }, 'Renamed.') }}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="List name" required />
              <button className="btn" disabled={busy || !name.trim() || name.trim() === active.name}>Rename</button>
            </form>
          )}

          <div className="field">
            <span className="field-label">People</span>
            <ul className="people">
              {members.map((m) => (
                <li key={m.user_id}>
                  <span className="grow">
                    {memberName(m)}{m.user_id === userId ? ' (you)' : ''}
                    <span className="muted small"> · {m.role === 'owner' ? 'owner' : 'can add and edit'}</span>
                  </span>
                  {isOwner && m.user_id !== userId && (
                    <button className="btn link small danger" disabled={busy}
                      onClick={() => confirm(`Remove ${memberName(m)} from “${active.name}”? They’ll no longer see its places.`) &&
                        run(async () => { await removeMember(active.id, m.user_id); await onChanged() }, `${memberName(m)} removed.`)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="field">
            <span className="field-label">Invite someone</span>
            {!invite ? (
              <button className="btn" onClick={makeInvite} disabled={busy}>Create invite link</button>
            ) : (
              <>
                <input readOnly value={invite} onFocus={(e) => e.target.select()} aria-label="Invite link" />
                <div className="row">
                  <button className="btn primary grow" onClick={shareInvite}>{copied ? 'Copied ✓' : canShare ? 'Share link…' : 'Copy link'}</button>
                </div>
                <span className="muted small">Send it by text or email. It works once, for 7 days. They’ll need a Stopover account (they can make one from the link).</span>
              </>
            )}
          </div>

          {msg && <p className={msg.kind} role="status">{msg.text}</p>}

          {isOwner ? (
            <button className="btn link small danger" disabled={busy}
              onClick={() => confirm(`Delete “${active.name}” and its places for everyone on it? This can’t be undone.`) &&
                run(async () => {
                  await deleteList(active.id)
                  const remaining = lists.filter((l) => l.id !== active.id)
                  if (!remaining.length) await createList('My places', userId)
                  await onChanged(remaining[0]?.id)
                })}>
              Delete this list
            </button>
          ) : (
            <button className="btn link small danger" disabled={busy}
              onClick={() => confirm(`Leave “${active.name}”? You’ll stop seeing its places.`) &&
                run(async () => {
                  await leaveList(active.id, userId)
                  const remaining = lists.filter((l) => l.id !== active.id)
                  if (!remaining.length) await createList('My places', userId)
                  await onChanged(remaining[0]?.id)
                })}>
              Leave this list
            </button>
          )}
        </div>
      )}

      <form className="row" onSubmit={(e) => {
        e.preventDefault()
        run(async () => { const id = await createList(newName, userId); setNewName(''); await onChanged(id) }, 'List created.')
      }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New list name, e.g. Summer 2027" maxLength={80} aria-label="New list name" />
        <button className="btn" disabled={busy || !newName.trim()}>Create</button>
      </form>
    </section>
  )
}
