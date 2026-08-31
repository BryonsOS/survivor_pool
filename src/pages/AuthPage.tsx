import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'signin' | 'signup'

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [realName, setRealName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) setError(signInError.message)
        return
      }

      if (!displayName.trim()) {
        setError('Pick a display name — it shows on the standings.')
        return
      }

      const { data: valid, error: rpcError } = await supabase.rpc('survivor_validate_invite', {
        code: inviteCode,
      })
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      if (!valid) {
        setError('That invite code is not valid. Ask the commissioner for the current code.')
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName.trim(),
            invite_code: inviteCode.trim(),
            real_name: realName.trim(),
          },
        },
      })
      if (signUpError) setError(signUpError.message)
      else if (!data.session) setNotice('Check your email to confirm your account, then sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-hero">
          <h1>
            Survivor <em>Pool</em>
          </h1>
          <p>One pick a week. Teams are one-time use. Two strikes and you're out.</p>
        </div>

        <div className="auth-tabs">
          <button
            className={mode === 'signin' ? 'active' : ''}
            onClick={() => {
              setMode('signin')
              setError(null)
              setNotice(null)
            }}
          >
            Sign In
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => {
              setMode('signup')
              setError(null)
              setNotice(null)
            }}
          >
            Join Pool
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <>
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Shows on the standings"
                  maxLength={30}
                  required
                />
              </label>
              <label>
                First name
                <input
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="So the pool knows who's who"
                  maxLength={60}
                  required
                />
              </label>
              <label>
                Invite code
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Pool invite code"
                  required
                />
              </label>
            </>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>

          {error && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-ok">{notice}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign In' : 'Join the Pool'}
          </button>

          {mode === 'signin' && (
            <>
              <p className="auth-hint">
                Already in the fantasy wrestling league? Use that same email and password — then
                enter the pool's invite code on the next screen.
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm forgot-link"
                disabled={busy}
                onClick={async () => {
                  setError(null)
                  setNotice(null)
                  if (!email.trim()) {
                    setError('Type your email above first, then tap Forgot password.')
                    return
                  }
                  setBusy(true)
                  const { error: resetError } = await supabase.auth.resetPasswordForEmail(
                    email.trim(),
                    { redirectTo: window.location.origin + '/reset' },
                  )
                  setBusy(false)
                  if (resetError) setError(resetError.message)
                  else setNotice('Reset link sent — check your email, then follow it to set a new password.')
                }}
              >
                Forgot password?
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
