import { useEffect, useState, type FormEvent } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { supabase } from '../lib/supabase'
import { actionErrorMessage } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { usePool } from '../context/PoolContext'

export default function AccountPage() {
  useDocumentTitle('Account')

  const { profile, refresh, session } = useAuth()
  const { entrants, reload } = usePool()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [teamName, setTeamName] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const myEntry = entrants.find((entrant) => entrant.user_id === session?.user.id)

  useEffect(() => {
    setTeamName(myEntry?.team_name ?? '')
  }, [myEntry?.team_name])

  // Pool-only, so renaming here leaves the shared wrestling profile alone.
  async function saveTeamName(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    setError(null)
    const { error: rpcError } = await supabase.rpc('survivor_set_team_name', { name: teamName })
    setBusy(false)
    if (rpcError) setError(actionErrorMessage(rpcError))
    else {
      setNotice(teamName.trim() ? 'Team name updated.' : 'Team name cleared.')
      await reload()
    }
  }

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
    if (writeError) setError(actionErrorMessage(writeError))
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

      <form className="stack-form" onSubmit={saveTeamName}>
        <label>
          Team name — this pool only
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder={profile?.display_name ?? 'Your team name'}
            maxLength={30}
          />
        </label>
        <p className="muted small">
          What the standings call you here. Leave it blank to use your profile name below.
          Changing it does not affect the wrestling league.
        </p>
        <button className="btn btn-primary" disabled={busy}>
          Save team name
        </button>
      </form>

      <form className="stack-form" onSubmit={saveName}>
        <label>
          Profile name — shared with the wrestling league
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
            required
          />
        </label>
        <p className="muted small">
          Used across both sites. Changing it renames you in the wrestling league too.
        </p>
        <button className="btn btn-secondary" disabled={busy || !displayName.trim()}>
          Save profile name
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
