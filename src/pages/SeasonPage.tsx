import { useMemo, useState } from 'react'
import { usePool } from '../context/PoolContext'
import { formatDeadline } from '../lib/time'
import { WEEK_STATUS_LABELS } from '../lib/types'

export default function SeasonPage() {
  const { weeks, picks, results, teams, profiles, loading, error } = usePool()
  const [openWeek, setOpenWeek] = useState<number | null>(null)

  const teamName = useMemo(() => new Map(teams.map((t) => [t.abbr, t.name])), [teams])
  const nameById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.display_name])),
    [profiles],
  )
  const resultFor = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of results) map.set(`${r.week}:${r.team}`, r.outcome)
    return map
  }, [results])

  if (loading) return <div className="page-loading">Loading the season…</div>
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>

  return (
    <div className="page">
      <div className="page-kicker">Week by week</div>
      <h1 className="page-title">Season</h1>
      <p className="board-help">
        Everyone's picks stay hidden until a week locks. Tap a week to see the board.
      </p>

      <div className="week-list">
        {weeks.map((week) => {
          const weekPicks = picks.filter((p) => p.week === week.week)
          const revealed = week.status === 'locked' || week.status === 'final'
          const expanded = openWeek === week.week

          return (
            <div key={week.week} className={`week-row ${week.status}`}>
              <button
                className="week-head"
                onClick={() => setOpenWeek(expanded ? null : week.week)}
                aria-expanded={expanded}
              >
                <span className="week-num">Week {week.week}</span>
                <span className={`week-status ${week.status}`}>
                  {WEEK_STATUS_LABELS[week.status]}
                </span>
                <span className="week-deadline">{formatDeadline(week.locks_at)}</span>
                <span className="week-chevron">{expanded ? '−' : '+'}</span>
              </button>

              {expanded && (
                <div className="week-body">
                  {!revealed ? (
                    <p className="muted small">
                      {week.status === 'open'
                        ? 'Picks are hidden until this week locks.'
                        : 'This week has not opened yet.'}
                    </p>
                  ) : weekPicks.length === 0 ? (
                    <p className="muted small">No picks were made this week.</p>
                  ) : (
                    <table className="week-table">
                      <tbody>
                        {weekPicks
                          .slice()
                          .sort((a, b) =>
                            (nameById.get(a.user_id) ?? '').localeCompare(nameById.get(b.user_id) ?? ''),
                          )
                          .map((pick) => {
                            const outcome = pick.team ? resultFor.get(`${week.week}:${pick.team}`) : null
                            return (
                              <tr key={pick.id}>
                                <td className="wt-name">{nameById.get(pick.user_id) ?? 'Member'}</td>
                                <td className="wt-team">
                                  {pick.is_bye ? 'BYE week' : teamName.get(pick.team ?? '') ?? pick.team}
                                </td>
                                <td className={`wt-result ${outcome ?? 'pending'}`}>
                                  {outcome ? outcome.toUpperCase() : pick.is_bye ? '—' : 'pending'}
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
