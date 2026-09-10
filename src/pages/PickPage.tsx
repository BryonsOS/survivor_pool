import { useEffect, useMemo, useState } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePool } from '../context/PoolContext'
import PaymentNotice from '../components/PaymentNotice'
import { safeExternalUrl } from '../lib/payments'
import { pickErrorMessage } from '../lib/errors'
import { countdownText, formatDeadline, formatKickoff } from '../lib/time'
import { formatChance, oddsAreFresh, teamWinChance } from '../lib/odds'
import { formatRecord, teamRecords } from '../lib/records'
import type { Game, Team } from '../lib/types'

export default function PickPage() {
  useDocumentTitle('My Pick')

  const { session } = useAuth()
  const userId = session!.user.id
  const { settings, teams, games, results, pool, picks, pickCounts, loading, error, reload } = usePool()
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

  // This week's game for each team. A team with no entry is on its bye, which means
  // it cannot win — the database rejects those picks too.
  const gameByTeam = useMemo(() => {
    const map = new Map<string, Game>()
    if (!week) return map
    for (const game of games) {
      if (game.week !== week.week) continue
      map.set(game.home, game)
      map.set(game.away, game)
    }
    return map
  }, [games, week])

  const totalPicksIn = useMemo(
    () => [...pickCounts.values()].reduce((sum, n) => sum + n, 0),
    [pickCounts],
  )
  const leaders = useMemo(
    () => [...pickCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
    [pickCounts],
  )

  // The next team pair to come off the board, so the top of the page says when.
  const nextKickoff = useMemo(() => {
    if (!week) return null
    return (
      games
        .filter((g) => g.week === week.week && g.kickoff_at && new Date(g.kickoff_at).getTime() > now)
        .sort((a, b) => a.kickoff_at!.localeCompare(b.kickoff_at!))[0] ?? null
    )
  }, [games, week, now])

  // Season records for every team, from the results the scores feed writes.
  const records = useMemo(() => teamRecords(results), [results])
  const recordOf = (abbr: string) => formatRecord(records.get(abbr))

  const oddsShown = useMemo(
    () => games.some((game) => game.week === week?.week && oddsAreFresh(game.odds_updated_at)),
    [games, week],
  )

  const myPickChance = useMemo(() => {
    if (!myPick?.team) return null
    const game = gameByTeam.get(myPick.team)
    if (!game || !oddsAreFresh(game.odds_updated_at)) return null
    return teamWinChance(myPick.team, game)
  }, [myPick, gameByTeam])

  /**
   * The bookmakers' chance that this team wins, or null when there is nothing
   * trustworthy to show — no game, no odds yet, or odds old enough to be wrong.
   */
  function chanceFor(team: Team, game: Game | undefined): number | null {
    if (!game || !oddsAreFresh(game.odds_updated_at)) return null
    return teamWinChance(team.abbr, game)
  }

  function matchup(team: Team, game: Game | undefined) {
    if (!game) return 'BYE week'
    const home = game.home === team.abbr
    const foe = home ? game.away : game.home
    const prefix = game.neutral_site ? 'vs' : home ? 'vs' : '@'
    const when = formatKickoff(game.kickoff_at)
    const foeRecord = recordOf(foe)
    return `${prefix} ${foe}${foeRecord ? ` (${foeRecord})` : ''}${when ? ` · ${when}` : ' · time TBD'}`
  }

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

  // The database refuses picks once locks_at passes, whether or not the week has
  // been flipped to 'locked'. Mirror that here so the board closes itself rather
  // than letting someone click into a rejection. `now` ticks every 30 seconds.
  const deadlinePassed = week.locks_at !== null && now >= new Date(week.locks_at).getTime()
  // Rolling locks: a team is off the board once its game kicks off, and a pick on
  // a team that has kicked off is frozen for the week — the database enforces both.
  const gameStarted = (game: Game | undefined) =>
    Boolean(game?.kickoff_at) && now >= new Date(game!.kickoff_at!).getTime()
  const pickFrozen = Boolean(myPick?.team) && gameStarted(gameByTeam.get(myPick!.team!))
  const isOpen = week.status === 'open' && !deadlinePassed && !pickFrozen
  const eliminated = me?.status === 'eliminated'
  const entered = Boolean(me)

  async function choose(team: Team) {
    if (!week || !isOpen || eliminated) return
    if (myPick?.team && myPick.team !== team.abbr) {
      const current = teams.find((t) => t.abbr === myPick.team)?.name ?? myPick.team
      const ok = window.confirm(
        `Change your Week ${week.week} pick from ${current} to ${team.name}?`,
      )
      if (!ok) return
    }
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
      setFailure(pickErrorMessage(writeError, team.name, week.week))
      return
    }

    setMessage(`Locked in: ${team.name}.`)
    await reload()
  }

  return (
    <div className="page">
      <div className="page-kicker">{settings.season} Season · Week {week.week}</div>
      <h1 className="page-title">{myPick ? 'Your pick is in' : 'Make your pick'}</h1>

      {settings.announcement?.trim() && (
        <div className="announcement" role="status">
          <span className="announcement-label">From the commissioner</span>
          <p>{settings.announcement}</p>
        </div>
      )}

      <div className="pick-status">
        <div className={`status-pill status-${isOpen ? week.status : week.status === 'open' ? 'locked' : week.status}`}>
          {isOpen && <span className="live-dot" />}
          {isOpen
            ? countdownText(week.locks_at, now)
            : week.status === 'final'
              ? 'Week final'
              : week.status === 'upcoming'
                ? 'Not open yet'
                : pickFrozen && !deadlinePassed
                  ? 'Your pick is locked — game underway'
                  : 'Picks are locked — results pending'}
        </div>
        <div className="muted">Final deadline {formatDeadline(week.locks_at)}</div>
      </div>

      {isOpen && (
        <div className="lock-rule">
          <strong>How locking works:</strong> each team locks at its own kickoff; everything still
          on the board locks {formatDeadline(week.locks_at)}. Once your team has kicked off, your
          pick is final for the week.
          {nextKickoff && (
            <span className="lock-next">
              {' '}Next to lock: {nextKickoff.away} @ {nextKickoff.home} · {formatKickoff(nextKickoff.kickoff_at)}
            </span>
          )}
        </div>
      )}

      {entered && me && !me.paid && <PaymentNotice settings={settings} picksOpen={isOpen} />}

      {!entered && (
        <div className="alert alert-error">
          You are not entered in the pool, so you have no pick to make. You can still manage
          everything from the Admin tab, or sign out and rejoin with the invite code to play.
        </div>
      )}

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
          {safeExternalUrl(settings.chat_url) && (
            <a
              className="inline-link"
              href={safeExternalUrl(settings.chat_url)!}
              target="_blank"
              rel="noreferrer noopener"
            >
              announcements ↗
            </a>
          )}
        </div>
      )}

      {myPick && (
        <div className={`current-pick ${isOpen ? '' : 'locked'}`}>
          <div className="current-pick-label">{isOpen ? 'Current pick — change it any time before the deadline' : 'Locked pick'}</div>
          <div className="current-pick-team">
            {myPick.is_bye ? 'BYE week' : teams.find((t) => t.abbr === myPick.team)?.name ?? myPick.team}
          </div>
          {!myPick.is_bye && myPick.team && gameByTeam.get(myPick.team) && (
            <div className="current-pick-game">
              {matchup(
                teams.find((t) => t.abbr === myPick.team) ?? {
                  abbr: myPick.team, name: myPick.team, conference: '', division: '',
                },
                gameByTeam.get(myPick.team),
              )}
              {myPickChance !== null && (
                <span className="current-pick-chance">
                  {' · '}
                  {formatChance(myPickChance)} to win
                </span>
              )}
            </div>
          )}
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

      {isOpen && !eliminated && entered && (
        <>
          {totalPicksIn > 0 && (
            <div className="pool-lean">
              <div className="pool-lean-head">
                <span className="pool-lean-title">How the pool is leaning</span>
                <span className="muted small">
                  {/* "of N" only when it can read sensibly — never "11 of 4" */}
                  {(pool?.aliveCount ?? 0) >= totalPicksIn
                    ? `${totalPicksIn} of ${pool?.aliveCount} picks in`
                    : `${totalPicksIn} picks in`}
                </span>
              </div>
              <div className="lean-rows">
                {leaders.map(([abbr, count]) => (
                  <div key={abbr} className="lean-row">
                    <span className="lean-team">{teams.find((t) => t.abbr === abbr)?.name ?? abbr}</span>
                    <span className="lean-bar">
                      <span
                        className="lean-fill"
                        style={{ width: `${Math.round((count / totalPicksIn) * 100)}%` }}
                      />
                    </span>
                    <span className="lean-pct">{Math.round((count / totalPicksIn) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="board-help">
            Teams you have already used are greyed out — every pick burns that team for the rest of
            the season, win or lose. Teams on their bye cannot be picked.
            {oddsShown && ' “win” is the sportsbooks’ consensus chance; “picked” is the share of this pool already on that team.'}
          </p>
          <div className="team-board">
            {grouped.map(([division, list]) => (
              <section key={division} className="division">
                <h2 className="division-name">{division}</h2>
                <div className="division-teams">
                  {list.map((team) => {
                    const game = gameByTeam.get(team.abbr)
                    const onBye = !game
                    const started = gameStarted(game)
                    const used = usedAbbrs.has(team.abbr)
                    const selected = myPick?.team === team.abbr
                    const chance = chanceFor(team, game)
                    return (
                      <button
                        key={team.abbr}
                        className={`team-btn${selected ? ' selected' : ''}${used || onBye || started ? ' used' : ''}`}
                        disabled={used || onBye || started || saving !== null}
                        onClick={() => choose(team)}
                        title={
                          onBye
                            ? `${team.name} are on a bye this week`
                            : used
                              ? `${team.name} already used`
                              : started
                                ? `${team.name} have already kicked off`
                                : `Pick ${team.name} — ${matchup(team, game)}`
                        }
                      >
                        <span className="team-abbr">{team.abbr}</span>
                        <span className="team-lines">
                          <span className="team-name">
                            {team.name}
                            {recordOf(team.abbr) && (
                              <span className="team-record"> {recordOf(team.abbr)}</span>
                            )}
                          </span>
                          <span className="team-matchup">{matchup(team, game)}</span>
                        </span>
                        {/* One right-hand column: a flag and two percentages side by
                            side used to collide with a long team name. */}
                        <span className="team-meta">
                          {selected && <span className="team-flag picked">picked</span>}
                          {saving === team.abbr && <span className="team-flag">saving…</span>}
                          {onBye && <span className="team-flag">bye</span>}
                          {!onBye && used && <span className="team-flag">used</span>}
                          {!onBye && !used && started && <span className="team-flag">kicked off</span>}
                          {!onBye && !used && !started && chance !== null && (
                            <span
                              className="team-chance"
                              title={`Sportsbooks give ${team.name} a ${formatChance(chance)} chance to win this game`}
                            >
                              {formatChance(chance)} win
                            </span>
                          )}
                          {!onBye && !used && !started && totalPicksIn > 0 && (pickCounts.get(team.abbr) ?? 0) > 0 && (
                            <span
                              className="team-share"
                              title={`${pickCounts.get(team.abbr)} of ${totalPicksIn} picks in this pool`}
                            >
                              {Math.round(((pickCounts.get(team.abbr) ?? 0) / totalPicksIn) * 100)}% picked
                            </span>
                          )}
                        </span>
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
