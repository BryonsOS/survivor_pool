import { usePool } from '../context/PoolContext'
import { buildRules } from '../lib/survivor'

export default function RulesPage() {
  const { settings, teams, pool, loading } = usePool()

  if (loading) return <div className="page-loading">Loading the rules…</div>
  if (!settings) return null

  const rules = buildRules(settings, teams.length || 32)

  return (
    <div className="page">
      <div className="page-kicker">{settings.season} · {pool?.formatLabel}</div>
      <h1 className="page-title">{settings.pool_name}</h1>
      <p className="board-help">
        These rules are generated from the pool's live settings, so what you read here is exactly
        what the scoring does.
      </p>

      <div className="rules-list">
        {rules.map((rule) => (
          <article key={rule.title} className="rule">
            <h2 className="rule-title">{rule.title}</h2>
            <p className="rule-body">{rule.body}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
