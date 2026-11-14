import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { appUrl, saveProfile, supabase, type MapsPref, type Place, type Profile } from '../lib/supabase'
import { friendlyAuthError, MIN_PASSWORD } from './Auth'
import { SavedPlaces } from './SavedPlaces'
import { ListsCard } from './ListsCard'
import { PrivacyCard } from './PrivacyCard'
import { LegalLinks } from './Legal'
import { Moderation } from './Moderation'
import type { List } from '../lib/lists'

type Msg = { kind: 'ok' | 'error'; text: string } | null
const Note = ({ msg }: { msg: Msg }) => (msg ? <p className={msg.kind} role="status">{msg.text}</p> : null)

const DETOURS = [5, 10, 25, 50, 100]

export function Account({ user, profile, places, lists, activeListId, onSwitchList, onListsChanged, onProfile, onClose, onEditPlace, isAdmin }: {
  user: User; profile: Profile; places: Place[]; onProfile: (p: Profile) => void; onClose: () => void
  lists: List[]; activeListId: string | null; onSwitchList: (id: string) => void; onListsChanged: (switchTo?: string) => Promise<void> | void
  onEditPlace: (p: Place) => void
  isAdmin?: boolean
}) {
  const [moderating, setModerating] = useState(false)
  if (moderating) return <Moderation onClose={() => setModerating(false)} />
  return (
    <>
      <button className="btn link" onClick={onClose}>‹ Back</button>
      <ProfileCard user={user} profile={profile} onProfile={onProfile} />
      {isAdmin && (
        <section className="card stack">
          <h2>Moderation</h2>
          <p className="muted small">Review reports from travelers, hide reviews and suspend accounts.</p>
          <button className="btn" onClick={() => setModerating(true)}>Open moderation</button>
        </section>
      )}
      <PrivacyCard profile={profile} onProfile={onProfile} />
      <ListsCard userId={user.id} lists={lists} activeId={activeListId} onSwitch={onSwitchList} onChanged={onListsChanged} />
      <SavedPlaces places={places} listName={lists.find((l) => l.id === activeListId)?.name} onEdit={onEditPlace} />
      <EmailCard user={user} />
      <PasswordCard />
      <section className="card stack">
        <h2>Sign out</h2>
        <button className="btn wide" onClick={() => supabase.auth.signOut()}>Sign out of Stopover</button>
      </section>
      <DeleteCard email={user.email ?? ''} placeCount={places.length} />
      <LegalLinks className="center" />
    </>
  )
}

function ProfileCard({ user, profile, onProfile }: { user: User; profile: Profile; onProfile: (p: Profile) => void }) {
  const [name, setName] = useState(profile.display_name ?? '')
  const [detour, setDetour] = useState(profile.default_detour_mi)
  const [maps, setMaps] = useState<MapsPref>(profile.maps_app)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      onProfile(await saveProfile(user.id, { display_name: name.trim() || null, default_detour_mi: detour, maps_app: maps }))
      setMsg({ kind: 'ok', text: 'Saved.' })
    } catch (e) {
      setMsg({ kind: 'error', text: friendlyAuthError(e) })
    } finally { setBusy(false) }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>Profile</h2>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" /></label>
      <div className="field">
        <span className="field-label">Usual detour when planning trips</span>
        <div className="chips">
          {DETOURS.map((d) => (
            <button key={d} type="button" className={d === detour ? 'chip on' : 'chip'} onClick={() => setDetour(d)}>{d} mi</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Open trips in</span>
        <div className="chips">
          {(['google', 'apple'] as MapsPref[]).map((m) => (
            <button key={m} type="button" className={m === maps ? 'chip on' : 'chip'} onClick={() => setMaps(m)}>
              {m === 'google' ? 'Google Maps' : 'Apple Maps'}
            </button>
          ))}
        </div>
        <span className="muted small">Shown first on the trip screen; the other stays available.</span>
      </div>
      <Note msg={msg} />
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>
  )
}

function EmailCard({ user }: { user: User }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const pending = user.new_email

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ email: email.trim() }, { emailRedirectTo: appUrl() })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: friendlyAuthError(error) })
    else {
      setMsg({ kind: 'ok', text: `Check ${email.trim()} for a confirmation link. Your email changes once it's confirmed (you may also get a link at your current address).` })
      setEmail('')
    }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>Email</h2>
      <p className="muted small">Signed in as <strong>{user.email}</strong>{pending ? ` · change to ${pending} waiting for confirmation` : ''}</p>
      <label>New email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <Note msg={msg} />
      <button className="btn" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Change email'}</button>
    </form>
  )
}

function PasswordCard() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (pw !== pw2) return setMsg({ kind: 'error', text: "Those passwords don't match." })
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: friendlyAuthError(error) })
    else { setMsg({ kind: 'ok', text: 'Password changed.' }); setPw(''); setPw2('') }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>Password</h2>
      <label>
        New password
        <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={pw} onChange={(e) => setPw(e.target.value)} required />
        <span className="muted small">At least {MIN_PASSWORD} characters.</span>
      </label>
      <label>Type it again<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></label>
      <Note msg={msg} />
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  )
}

function DeleteCard({ email, placeCount }: { email: string; placeCount: number }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  async function del() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('delete_my_account')
    if (error) { setBusy(false); return setMsg({ kind: 'error', text: error.message }) }
    await supabase.auth.signOut({ scope: 'local' })
  }

  return (
    <section className="card stack danger-zone">
      <h2>Delete account</h2>
      {!open ? (
        <>
          <p className="muted small">Permanently deletes your account, your {placeCount} saved place{placeCount === 1 ? '' : 's'} and your trips. This can't be undone — export first if you want a copy.</p>
          <button className="btn danger" onClick={() => setOpen(true)}>Delete my account…</button>
        </>
      ) : (
        <>
          <label>
            Type your email (<strong>{email}</strong>) to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" />
          </label>
          <Note msg={msg} />
          <div className="row">
            <button className="btn" onClick={() => { setOpen(false); setTyped('') }}>Cancel</button>
            <button className="btn danger-solid" disabled={busy || typed.trim().toLowerCase() !== email.toLowerCase()} onClick={del}>
              {busy ? 'Deleting…' : 'Permanently delete'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
