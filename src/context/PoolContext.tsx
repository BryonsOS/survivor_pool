import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { buildPool, type PoolState } from '../lib/survivor'
import type { Entrant, Game, PickRow, PoolSettings, Profile, Result, Team, Week } from '../lib/types'

interface PoolData {
  settings: PoolSettings | null
  teams: Team[]
  weeks: Week[]
  results: Result[]
  games: Game[]
  entrants: Entrant[]
  profiles: Profile[]
  picks: PickRow[]
  pool: PoolState | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const PoolContext = createContext<PoolData>({
  settings: null,
  teams: [],
  weeks: [],
  results: [],
  games: [],
  entrants: [],
  profiles: [],
  picks: [],
  pool: null,
  loading: true,
  error: null,
  reload: async () => {},
})

export function PoolProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PoolSettings | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [weeks, setWeeks] = useState<Week[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [entrants, setEntrants] = useState<Entrant[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [picks, setPicks] = useState<PickRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    const [s, t, w, r, e, p, k, g] = await Promise.all([
      supabase.from('survivor_settings').select('*').maybeSingle(),
      supabase.from('survivor_teams').select('*').order('conference').order('division').order('name'),
      supabase.from('survivor_weeks').select('*').order('week'),
      supabase.from('survivor_results').select('*'),
      supabase.from('survivor_entrants').select('*'),
      supabase.from('profiles').select('id, display_name, is_admin'),
      // RLS returns only what the viewer may see: their own picks always, plus
      // everyone's once a week is locked or final.
      supabase.from('survivor_picks').select('*'),
      supabase.from('survivor_games').select('*').order('week').order('kickoff_at', { nullsFirst: false }),
    ])

    const firstError = [s, t, w, r, e, p, k, g].find((res) => res.error)?.error
    if (firstError) setError(firstError.message)

    setSettings((s.data as PoolSettings) ?? null)
    setTeams((t.data as Team[]) ?? [])
    setWeeks((w.data as Week[]) ?? [])
    setResults((r.data as Result[]) ?? [])
    setEntrants((e.data as Entrant[]) ?? [])
    setProfiles((p.data as Profile[]) ?? [])
    setPicks((k.data as PickRow[]) ?? [])
    setGames((g.data as Game[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const pool = useMemo(() => {
    if (!settings) return null
    return buildPool({ settings, teams, weeks, results, entrants, profiles, picks })
  }, [settings, teams, weeks, results, entrants, profiles, picks])

  return (
    <PoolContext.Provider
      value={{ settings, teams, weeks, results, games, entrants, profiles, picks, pool, loading, error, reload }}
    >
      {children}
    </PoolContext.Provider>
  )
}

export function usePool() {
  return useContext(PoolContext)
}
