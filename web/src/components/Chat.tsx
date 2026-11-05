import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { block, markRead, report, sendMessage, thread, traveler, type Message } from '../lib/social'

/** One conversation, live. */
export function Chat({ me, other, firstName, checkinId, onBack, onBlocked, onRead }: {
  me: string
  other: string
  firstName: string
  checkinId?: string | null
  onBack: () => void
  onBlocked: () => void
  onRead: () => void
}) {
  const [msgs, setMsgs] = useState<Message[] | null>(null)
  const [who, setWho] = useState<{ first_name: string; rig: string | null; is_friend: boolean; can_message: boolean } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const [m, t] = await Promise.all([thread(other), traveler(other)])
      setMsgs(m); setWho(t)
      if (m.some((x) => x.recipient_id === me && !x.read_at)) { await markRead(other); onRead() }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [other, me, onRead])

  useEffect(() => { load() }, [load])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])

  // New messages arrive live (Realtime only delivers your own conversations)
  useEffect(() => {
    const ch = supabase
      .channel(`chat-${other}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${other}` }, () => load())
      .subscribe()
    const t = setInterval(load, 30000) // fallback if the live connection drops
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [other, load])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true); setErr(null)
    try {
      await sendMessage(other, text, msgs?.length ? null : checkinId)
      setText('')
      await load()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  async function doBlock() {
    if (!confirm(`Block ${firstName}? They won’t be able to message you or see your check-ins, and you won’t see theirs.`)) return
    try { await block(other); onBlocked() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  async function doReport() {
    const reason = prompt(`What’s wrong? (This goes to the Stopover team, not to ${firstName}.)`)
    if (reason === null) return
    try {
      const last = [...(msgs ?? [])].reverse().find((m) => m.sender_id === other)
      await report(other, reason, last?.id)
      if (confirm('Thanks — reported. Block them too?')) await doBlock()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    const sameDay = d.toDateString() === new Date().toDateString()
    return sameDay ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <section className="card chat">
      <div className="chat-head">
        <button className="btn link" onClick={onBack}>‹</button>
        <div className="grow">
          <strong>{who?.first_name ?? firstName}</strong>
          <span className="muted small">{[who?.rig, who?.is_friend ? 'friend' : null].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="menu-wrap">
          <button className="btn link small" onClick={() => setMenu(!menu)} aria-label="More">•••</button>
          {menu && (
            <div className="menu">
              <button onClick={() => { setMenu(false); doReport() }}>Report</button>
              <button className="danger" onClick={() => { setMenu(false); doBlock() }}>Block {firstName}</button>
            </div>
          )}
        </div>
      </div>
      {!who?.is_friend && <p className="muted small safety">Meeting someone new? Pick a public spot, and you don’t have to share your site number or contact details.</p>}
      <div className="bubbles">
        {msgs === null && <p className="muted">Loading…</p>}
        {msgs?.length === 0 && <p className="muted small">Say hello — e.g. “Hi! We’re here too. Want to grab coffee by the visitor center?”</p>}
        {msgs?.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === me ? 'me' : 'them'}`}>
            <div>{m.body}</div>
            <div className="bubble-time">{fmt(m.created_at)}</div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {err && <p className="error">{err}</p>}
      {who && !who.can_message ? (
        <p className="muted small">You can’t message {firstName} right now — their check-in has ended and you’re not friends.</p>
      ) : (
        <form className="row chat-send" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={`Message ${firstName}…`} aria-label="Message" />
          <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
        </form>
      )}
    </section>
  )
}
