import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/**
 * Signed in, but not enrolled in this pool — the path an existing fantasy-wrestling
 * member takes. They already have an account; they just need the pool's invite code.
 */
export default function JoinPage() {
  const { profile, signOut, refresh } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { data, error: rpcError } = await supabase.rpc('survivor_join', { code })
    setBusy(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (!data) {
      setError('That invite code is not valid. Ask the commissioner for the current code.')
      return
    }
    await refresh()
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-hero">
          <h1>
            Join the <em>Pool</em>
          </h1>
          <p>
            You're signed in as {profile?.display_name ?? 'a member'}, but you're not in the survivor
            pool yet. Enter the invite code to get in.
          </p>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            Invite code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Pool invite code"
              required
              autoFocus
            />
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Checking…' : 'Join the Pool'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
