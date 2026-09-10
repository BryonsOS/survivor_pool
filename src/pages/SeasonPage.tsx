import { useMemo, useState } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { usePool } from '../context/PoolContext'
import { formatDeadline } from '../lib/time'
import { WEEK_STATUS_LABELS, type PickRow } from '../lib/types'
import { formatRecord, teamRecords } from '../lib/records'

/** Who took whom, biggest crowd first — the view that answers "did anyone else take them?" */
function groupByTeam(weekPicks: PickRow[]): { team: string | null; userIds: string[] }[] {
  const groups = new Map<string | null, string[]>()
  for (const pick of weekPicks) {
    const key = pick.is_bye ? null : pick.team
    const list = groups.get(key) ?? []
    list.push(pick.user_id)
    groups.set(key, list)
  }
  return [...groups.entries()]
    .map(([team, userIds]) => ({ team, userIds }))
    .sort(
      (a, b) =>
        b.userIds.length - a.userIds.length || (a.team ?? 'zzz').localeCompare(b.team ?? 'zzz'),
    )
}

export default function SeasonPage() {
  useDocumentTitle('Season')

  const { weeks, picks, results, teams, pool, loading, error } = usePool()
  const [openWeek, setOpenWeek] = useState<number | null>(null)

  const teamName = useMemo(() => new Map(teams.map((t) => [t.abbr, t.name])), [teams])
  // Same names the standings use: pool team name, with the real first name beside
  // it, so a screen name nobody recognises is still attributable.
  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const standing of pool?.standings ?? []) {
      map.set(
        standing.userId,
        standing.realName ? `${standing.name} (${standing.realName})` : standing.name,
      )
    }
    return map
  }, [pool])
  const records = useMemo(() => teamRecords(results), [results])

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
        Everyone's picks stay hidden until a week locks. Tap a week to see who took whom.
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
                aria-label={`${expanded ? 'Hide' : 'Show'} Week ${week.week} picks`}
              >
                <span className="week-num">Week {week.week}</span>
                <span className={`week-status ${week.status}`}>
                  {WEEK_STATUS_LABELS[week.status]}
                </span>
                <span className="week-deadline">{formatDeadline(week.locks_at)}</span>
                <span className="week-chevron" aria-hidden="true">{expanded ? '−' : '+'}</span>
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
                    <div className="pick-groups">
                      {groupByTeam(weekPicks).map((group) => {
                        const outcome = group.team ? resultFor.get(`${week.week}:${group.team}`) : null
                        return (
                          <div key={group.team ?? 'bye'} className="pick-group">
                            <div className="pick-group-head">
                              <span className="pick-group-team">
                                {group.team ? teamName.get(group.team) ?? group.team : 'BYE week'}
                                {group.team && formatRecord(records.get(group.team)) && (
                                  <span className="team-record"> {formatRecord(records.get(group.team))}</span>
                                )}
                              </span>
                              <span className="pick-group-count">
                                {group.userIds.length}
                                {group.userIds.length === 1 ? ' pick' : ' picks'}
                              </span>
                              <span className={`wt-result ${outcome ?? 'pending'}`}>
                                {/* a glyph as well as colour, so the result reads
                                    without relying on red-vs-green */}
                                {outcome === 'win' && '✓ WIN'}
                                {outcome === 'loss' && '✕ LOSS'}
                                {outcome === 'tie' && '= TIE'}
                                {!outcome && (group.team ? 'pending' : '—')}
                              </span>
                            </div>
                            <div className="pick-group-names">
                              {group.userIds
                                .map((id) => nameById.get(id) ?? 'Member')
                                .sort((a, b) => a.localeCompare(b))
                                .join(', ')}
                            </div>
                          </div>
                        )
                      })}
                    </div>
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
