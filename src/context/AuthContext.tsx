import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** Enrolled in the survivor pool (distinct from having an account). */
  isEntrant: boolean
  loading: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  isEntrant: false,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isEntrant, setIsEntrant] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load(userId: string) {
    const [{ data: profileRow }, { data: entrantRow }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('survivor_entrants').select('user_id').eq('user_id', userId).maybeSingle(),
    ])
    setProfile((profileRow as Profile) ?? null)
    setIsEntrant(Boolean(entrantRow))
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        load(data.session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) {
        load(next.user.id)
      } else {
        setProfile(null)
        setIsEntrant(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        isEntrant,
        loading,
        signOut: async () => {
          await supabase.auth.signOut()
        },
        refresh: async () => {
          if (session) await load(session.user.id)
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
