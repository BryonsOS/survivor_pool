import { useAuth } from '../context/AuthContext'
import { usePool } from '../context/PoolContext'

export default function StandingsPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const { pool, settings, loading, error } = usePool()

  if (loading) return <div className="page-loading">Tallying survivors…</div>
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>
  if (!pool || !settings) return null

  return (
    <div className="page">
      <div className="page-kicker">{settings.season} Season</div>
      <h1 className="page-title">Standings</h1>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-value">{pool.aliveCount}</div>
          <div className="stat-label">Still alive</div>
        </div>
        <div className="stat">
          <div className="stat-value">{pool.eliminatedCount}</div>
          <div className="stat-label">Eliminated</div>
        </div>
        <div className="stat">
          <div className="stat-value">{pool.weeksGraded}</div>
          <div className="stat-label">Weeks final</div>
        </div>
        <div className="stat">
          <div className="stat-value">{pool.potLabel}</div>
          <div className="stat-label">Pot</div>
        </div>
      </div>

      {pool.championName && (
        <div className="champion-banner">
          <div className="champion-mark">🏆</div>
          <div>
            <div className="champion-label">Last player standing</div>
            <div className="champion-name">{pool.championName}</div>
          </div>
        </div>
      )}

      {pool.standings.length === 0 ? (
        <div className="empty-state">
          <p>Nobody has joined the pool yet. Share the invite code from the Admin tab.</p>
        </div>
      ) : (
        <div className="standings-list">
          {pool.standings.map((row, index) => (
            <article
              key={row.userId}
              className={`standing ${row.status}${row.userId === userId ? ' me' : ''}`}
            >
              <div className="standing-head">
                <div className="standing-rank">{index + 1}</div>
                <div className="standing-id">
                  <div className="standing-name">
                    {row.name}
                    {row.status === 'winner' && ' 🏆'}
                    {row.userId === userId && <span className="you-tag">you</span>}
                  </div>
                  <div className="standing-status">{row.statusLabel}</div>
                </div>
                <div className="standing-meta">
                  <span
                    className="strikes"
                    title={`${row.strikes} of ${row.strikesToEliminate} strikes`}
                  >
                    {Array.from({ length: row.strikesToEliminate }, (_, i) => (
                      <span key={i} className={i < row.strikes ? 'strike on' : 'strike'} />
                    ))}
                  </span>
                  <span className="teams-left">{row.teamsRemaining} left</span>
                </div>
              </div>

              <div className="standing-last">{row.lastOutcomeLabel}</div>

              {row.teamsUsed.length > 0 ? (
                <div className="used-teams">
                  {row.teamsUsed.map((team) => (
                    <span key={team.abbr} className="used-team">
                      {team.abbr}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="muted small">No teams burned yet.</div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
