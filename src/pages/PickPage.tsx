import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePool } from '../context/PoolContext'
import { countdownText, formatDeadline } from '../lib/time'
import type { Team } from '../lib/types'

export default function PickPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const { settings, teams, pool, picks, loading, error, reload } = usePool()
  const [now, setNow] = useState(() => Date.now())
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const week = pool?.currentWeek ?? null
  const me = pool?.standings.find((row) => row.userId === userId)
  const myPick = useMemo(
    () => (week ? picks.find((p) => p.user_id === userId && p.week === week.week) ?? null : null),
    [picks, userId, week],
  )

  const usedAbbrs = useMemo(() => {
    const set = new Set((me?.teamsUsed ?? []).map((team) => team.abbr))
    // This week's own pick counts as burned in the standings, but on this board it
    // is the live selection — show it picked, not spent.
    if (myPick?.team) set.delete(myPick.team)
    return set
  }, [me, myPick])

  const grouped = useMemo(() => {
    const map = new Map<string, Team[]>()
    for (const team of teams) {
      const key = `${team.conference} ${team.division}`
      const list = map.get(key) ?? []
      list.push(team)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [teams])

  if (loading) return <div className="page-loading">Loading the board…</div>
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!settings || !week) {
    return (
      <div className="page">
        <div className="empty-state">
          <p>The season has not been set up yet. Check back once the commissioner opens Week 1.</p>
        </div>
      </div>
    )
  }

  const isOpen = week.status === 'open'
  const eliminated = me?.status === 'eliminated'

  async function choose(team: Team) {
    if (!week || !isOpen || eliminated) return
    setSaving(team.abbr)
    setMessage(null)
    setFailure(null)

    const { error: writeError } = await supabase
      .from('survivor_picks')
      .upsert(
        { user_id: userId, week: week.week, team: team.abbr, is_bye: false, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,week' },
      )

    setSaving(null)

    if (writeError) {
      // The one-time-use rule is a unique index, so a repeat pick fails here even
      // if the UI somehow offered it.
      setFailure(
        writeError.code === '23505'
          ? `You have already used ${team.name} this season. Teams are one-time use.`
          : writeError.message,
      )
      return
    }

    setMessage(`Locked in: ${team.name}.`)
    await reload()
  }

  return (
    <div className="page">
      <div className="page-kicker">{settings.season} Season · Week {week.week}</div>
      <h1 className="page-title">{myPick ? 'Your pick is in' : 'Make your pick'}</h1>

      <div className="pick-status">
        <div className={`status-pill status-${week.status}`}>
          {week.status === 'open' && <span className="live-dot" />}
          {week.status === 'open'
            ? countdownText(week.locks_at, now)
            : week.status === 'locked'
              ? 'Picks are locked — results pending'
              : week.status === 'final'
                ? 'Week final'
                : 'Not open yet'}
        </div>
        <div className="muted">Deadline {formatDeadline(week.locks_at)}</div>
      </div>

      {eliminated && (
        <div className="alert alert-error">
          You were eliminated in Week {me?.eliminatedWeek}. You can still watch the standings.
        </div>
      )}

      {me && !eliminated && (
        <div className="my-line">
          <span className="strikes" title={`${me.strikes} of ${me.strikesToEliminate} strikes`}>
            {Array.from({ length: me.strikesToEliminate }, (_, i) => (
              <span key={i} className={i < me.strikes ? 'strike on' : 'strike'} />
            ))}
          </span>
          <span>{me.statusLabel}</span>
          <span className="muted">· {me.teamsRemaining} teams left</span>
          <Link to="/standings" className="inline-link">
            standings →
          </Link>
        </div>
      )}

      {myPick && (
        <div className={`current-pick ${isOpen ? '' : 'locked'}`}>
          <div className="current-pick-label">{isOpen ? 'Current pick — change it any time before the deadline' : 'Locked pick'}</div>
          <div className="current-pick-team">
            {myPick.is_bye ? 'BYE week' : teams.find((t) => t.abbr === myPick.team)?.name ?? myPick.team}
          </div>
        </div>
      )}

      {message && <div className="alert alert-ok">{message}</div>}
      {failure && <div className="alert alert-error">{failure}</div>}

      {!isOpen && !myPick && (
        <div className="empty-state">
          <p>
            {week.status === 'upcoming'
              ? 'Week is not open yet. Picks appear here as soon as the commissioner opens them.'
              : 'Picks are closed for this week and you did not get one in.'}
          </p>
        </div>
      )}

      {isOpen && !eliminated && (
        <>
          <p className="board-help">
            Teams you have already used are greyed out — every pick burns that team for the rest of
            the season, win or lose.
          </p>
          <div className="team-board">
            {grouped.map(([division, list]) => (
              <section key={division} className="division">
                <h2 className="division-name">{division}</h2>
                <div className="division-teams">
                  {list.map((team) => {
                    const used = usedAbbrs.has(team.abbr)
                    const selected = myPick?.team === team.abbr
                    return (
                      <button
                        key={team.abbr}
                        className={`team-btn${selected ? ' selected' : ''}${used ? ' used' : ''}`}
                        disabled={used || saving !== null}
                        onClick={() => choose(team)}
                        title={used ? `${team.name} already used` : `Pick ${team.name}`}
                      >
                        <span className="team-abbr">{team.abbr}</span>
                        <span className="team-name">{team.name}</span>
                        {used && <span className="team-flag">used</span>}
                        {selected && <span className="team-flag picked">picked</span>}
                        {saving === team.abbr && <span className="team-flag">saving…</span>}
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          {settings.bye_weeks_per_player > 0 && me && me.byesRemaining > 0 && (
            <button
              className="btn btn-secondary bye-btn"
              disabled={saving !== null}
              onClick={async () => {
                setSaving('BYE')
                setFailure(null)
                const { error: byeError } = await supabase.from('survivor_picks').upsert(
                  { user_id: userId, week: week.week, team: null, is_bye: true, updated_at: new Date().toISOString() },
                  { onConflict: 'user_id,week' },
                )
                setSaving(null)
                if (byeError) setFailure(byeError.message)
                else {
                  setMessage('BYE week used — no strike, no team burned.')
                  await reload()
                }
              }}
            >
              Take a BYE week ({me.byesRemaining} left)
            </button>
          )}
        </>
      )}
    </div>
  )
}
