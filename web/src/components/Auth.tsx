import { useState } from 'react'
import { appUrl, supabase } from '../lib/supabase'
import { legalHref, LegalLinks } from './Legal'

type Mode = 'in' | 'up' | 'forgot'
export const MIN_PASSWORD = 8

export function Auth({ notice }: { notice?: string } = {}) {
  const [mode, setMode] = useState<Mode>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  function switchTo(m: Mode) {
    setMode(m)
    setMsg(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: appUrl(), data: name.trim() ? { display_name: name.trim() } : undefined },
        })
        if (error) throw error
        if (!data.session) setMsg({ kind: 'ok', text: 'Almost there — check your email and tap the link to confirm your account.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })
        if (error) throw error
        // Same message whether or not the address has an account, so this can't be used to probe for users.
        setMsg({ kind: 'ok', text: 'If that email has an account, a reset link is on its way. Check your inbox (and spam).' })
      }
    } catch (e) {
      setMsg({ kind: 'error', text: friendlyAuthError(e) })
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create your account' : 'Reset your password'

  return (
    <main className="auth">
      <div className="brand big">
        <span className="sign">STOP</span>over
      </div>
      <p className="tagline">Save the places you pass. Find them again when you're headed that way.</p>
      <form onSubmit={submit} className="card stack">
        {notice && <p className="ok banner-ok">{notice}</p>}
        <h2>{title}</h2>
        {mode === 'forgot' && <p className="muted small">Enter your account email and we'll send a link to choose a new password.</p>}
        {mode === 'up' && (
          <label>
            <span>Your name <span className="muted small">(optional)</span></span>
            <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
        )}
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {mode !== 'forgot' && (
          <label>
            <span className="label-row">
              Password
              {mode === 'in' && (
                <button type="button" className="btn link small" onClick={() => switchTo('forgot')}>Forgot password?</button>
              )}
            </span>
            <input
              type="password"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              minLength={mode === 'up' ? MIN_PASSWORD : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {mode === 'up' && <span className="muted small">At least {MIN_PASSWORD} characters.</span>}
          </label>
        )}
        {mode === 'up' && (
          <p className="muted small">
            By creating an account you agree to the <a href={legalHref('terms')}>Terms</a> and <a href={legalHref('privacy')}>Privacy policy</a>.
          </p>
        )}
        {msg && <p className={msg.kind === 'error' ? 'error' : 'ok'} role="status">{msg.text}</p>}
        <button className="btn primary wide" disabled={busy}>
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
        </button>
        {mode === 'in' && <button type="button" className="btn link" onClick={() => switchTo('up')}>New here? Create an account</button>}
        {mode !== 'in' && <button type="button" className="btn link" onClick={() => switchTo('in')}>Back to sign in</button>}
      </form>
      <LegalLinks className="center" />
    </main>
  )
}

/** Shown after following a password-reset link. */
export function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setErr("Those passwords don't match.")
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setErr(friendlyAuthError(error))
    else onDone()
  }

  return (
    <main className="auth">
      <div className="brand big"><span className="sign">STOP</span>over</div>
      <form onSubmit={submit} className="card stack">
        <h2>Choose a new password</h2>
        <label>
          New password
          <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} required />
          <span className="muted small">At least {MIN_PASSWORD} characters.</span>
        </label>
        <label>
          Type it again
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {err && <p className="error">{err}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </main>
  )
}

export function friendlyAuthError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/invalid login credentials/i.test(m)) return 'That email and password don’t match. Try again, or use “Forgot password?”.'
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first — look for the link we sent when you signed up.'
  if (/already registered|already exists/i.test(m)) return 'There’s already an account with that email. Sign in, or use “Forgot password?”.'
  if (/rate limit|too many/i.test(m)) return 'Too many attempts or emails in a short time. Please wait a few minutes and try again.'
  if (/should be different/i.test(m)) return 'That’s your current password — pick a new one.'
  if (/weak|pwned|leaked/i.test(m)) return 'That password is too easy to guess or has appeared in a data breach. Please choose another.'
  return m
}
