import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function AccountPage() {
  const { profile, refresh } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveName(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    setError(null)
    const { error: writeError } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', profile!.id)
    setBusy(false)
    if (writeError) setError(writeError.message)
    else {
      setNotice('Display name updated.')
      await refresh()
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    setError(null)
    const { error: writeError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (writeError) setError(writeError.message)
    else {
      setNotice('Password updated.')
      setPassword('')
    }
  }

  return (
    <div className="page">
      <div className="page-kicker">Account</div>
      <h1 className="page-title">Your settings</h1>

      {notice && <div className="alert alert-ok">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <form className="stack-form" onSubmit={saveName}>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
            required
          />
        </label>
        <button className="btn btn-secondary" disabled={busy || !displayName.trim()}>
          Save name
        </button>
      </form>

      <form className="stack-form" onSubmit={savePassword}>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            autoComplete="new-password"
            required
          />
        </label>
        <button className="btn btn-secondary" disabled={busy || password.length < 6}>
          Update password
        </button>
      </form>

      <p className="muted small">
        This account is shared with the fantasy wrestling league — changing your password here
        changes it there too.
      </p>
    </div>
  )
}
