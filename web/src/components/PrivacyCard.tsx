import { useEffect, useState } from 'react'
import { blockedPeople, RIGS, unblock, VISIBILITY, type Visibility } from '../lib/social'
import { saveProfile, type Profile } from '../lib/supabase'

/** Meet-up privacy: who sees your check-ins by default, your rig, and people you've blocked. */
export function PrivacyCard({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const [vis, setVis] = useState<Visibility>(profile.presence_visibility ?? 'friends')
  const [rig, setRig] = useState(profile.rig ?? '')
  const [blocked, setBlocked] = useState<{ user_id: string; first_name: string }[]>([])
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { blockedPeople().then(setBlocked).catch(() => {}) }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      onProfile(await saveProfile(profile.id, { presence_visibility: vis, rig: rig || null }))
      setMsg({ kind: 'ok', text: 'Saved.' })
    } catch (e) { setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) }) } finally { setBusy(false) }
  }

  return (
    <form className="card stack" onSubmit={save} id="privacy">
      <h2>Meet-ups &amp; privacy</h2>
      <div className="field">
        <span className="field-label">Who sees your “I’m here” and “I’m going” by default</span>
        <div className="chips">
          {(Object.keys(VISIBILITY) as Visibility[]).map((v) => (
            <button key={v} type="button" className={vis === v ? 'chip on' : 'chip'} onClick={() => setVis(v)}>{VISIBILITY[v].label}</button>
          ))}
        </div>
        <span className="muted small">{VISIBILITY[vis].help} You can change it for each check-in.</span>
      </div>
      <label>
        Your rig <span className="muted small">(shown with your first name)</span>
        <select value={rig} onChange={(e) => setRig(e.target.value)}>
          <option value="">Don’t show</option>
          {RIGS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <p className="muted small">Others only ever see your first name, rig, the place and when, and any note you add — never your live location, last name or email.</p>
      {msg && <p className={msg.kind}>{msg.text}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      {blocked.length > 0 && (
        <div className="field">
          <span className="field-label">Blocked</span>
          <ul className="people">
            {blocked.map((b) => (
              <li key={b.user_id}>
                <span className="grow">{b.first_name}</span>
                <button type="button" className="btn link small" onClick={async () => { await unblock(b.user_id); setBlocked((x) => x.filter((y) => y.user_id !== b.user_id)) }}>Unblock</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  )
}
