import { useEffect, useMemo, useState } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { supabase } from '../lib/supabase'
import { actionErrorMessage } from '../lib/errors'
import { usePool } from '../context/PoolContext'
import { formatDeadline, toDatetimeLocal } from '../lib/time'
import { safePaymentUrl } from '../lib/payments'
import type { Outcome, Week, WeekStatus } from '../lib/types'

export default function AdminPage() {
  useDocumentTitle('Admin')

  const { settings, teams, weeks, results, picks, pool, entrants, profiles, loading, reload } = usePool()
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('survivor_invite')
      .select('invite_code')
      .maybeSingle()
      .then(({ data }) => setInviteCode(data?.invite_code ?? ''))
  }, [])

  useEffect(() => {
    if (selectedWeek === null && pool?.currentWeek) setSelectedWeek(pool.currentWeek.week)
  }, [pool, selectedWeek])

  const week = useMemo(
    () => weeks.find((w) => w.week === selectedWeek) ?? null,
    [weeks, selectedWeek],
  )

  const nameById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.display_name])),
    [profiles],
  )

  // Alive players with no pick in the open week. Missing the deadline costs a
  // strike, so the commissioner needs to see this before it happens.
  const missingPicks = useMemo(() => {
    if (!week || week.status !== 'open' || !pool) return []
    const picked = new Set(
      picks.filter((p) => p.week === week.week).map((p) => p.user_id),
    )
    return pool.standings.filter(
      (row) => row.status !== 'eliminated' && !picked.has(row.userId),
    )
  }, [week, pool, picks])

  // Teams actually picked this week — the only ones needing a result entered.
  const pickedTeams = useMemo(() => {
    if (!week) return []
    const abbrs = new Set(
      picks.filter((p) => p.week === week.week && p.team).map((p) => p.team as string),
    )
    return teams.filter((t) => abbrs.has(t.abbr))
  }, [picks, teams, week])

  const resultFor = useMemo(() => {
    const map = new Map<string, Outcome>()
    for (const r of results) map.set(`${r.week}:${r.team}`, r.outcome)
    return map
  }, [results])

  // Supabase query builders are thenables rather than real Promises.
  type Write = PromiseLike<{ error: { message: string } | null }>

  async function run(label: string, fn: () => Write) {
    setBusy(true)
    setNotice(null)
    setError(null)
    const { error: writeError } = await fn()
    setBusy(false)
    if (writeError) setError(`${label} — ${actionErrorMessage(writeError)}`)
    else {
      setNotice(label)
      await reload()
    }
  }

  async function setStatus(target: Week, status: WeekStatus) {
    await run(`Week ${target.week} → ${status}`, async () => {
      const res = await supabase.from('survivor_weeks').update({ status }).eq('week', target.week)
      if (!res.error && status === 'final') {
        // Rolling the season forward: open the next week automatically.
        const next = weeks.find((w) => w.week === target.week + 1)
        if (next && next.status === 'upcoming') {
          await supabase.from('survivor_weeks').update({ status: 'open' }).eq('week', next.week)
        }
      }
      return res
    })
  }

  async function setResult(abbr: string, outcome: Outcome) {
    if (!week) return
    await run(`${abbr} → ${outcome}`, () =>
      supabase
        .from('survivor_results')
        .upsert({ week: week.week, team: abbr, outcome }, { onConflict: 'week,team' }),
    )
  }

  if (loading) return <div className="page-loading">Loading admin…</div>
  if (!settings) return null

  return (
    <div className="page">
      <div className="page-kicker">Commissioner</div>
      <h1 className="page-title">Admin</h1>

      {notice && <div className="alert alert-ok">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <section className="admin-block">
        <h2 className="admin-heading">Invite code</h2>
        <p className="muted small">
          Share this with players. Existing wrestling-league members sign in with their usual
          account and enter this code once to join.
        </p>
        <div className="inline-form">
          <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          <button
            className="btn btn-secondary"
            disabled={busy || !inviteCode.trim()}
            onClick={() =>
              run('Invite code updated', () =>
                supabase
                  .from('survivor_invite')
                  .update({ invite_code: inviteCode.trim() })
                  .eq('id', true),
              )
            }
          >
            Save
          </button>
        </div>
      </section>

      <section className="admin-block">
        <h2 className="admin-heading">Weeks</h2>
        <p className="muted small">
          Open a week to accept picks, lock it at kickoff to reveal them, then mark it final once
          results are in. Marking a week final opens the next one.
        </p>
        <div className="admin-weeks">
          {weeks.map((w) => (
            <button
              key={w.week}
              className={`admin-week ${w.status}${selectedWeek === w.week ? ' selected' : ''}`}
              onClick={() => setSelectedWeek(w.week)}
            >
              <span className="aw-num">W{w.week}</span>
              <span className="aw-status">{w.status}</span>
            </button>
          ))}
        </div>
      </section>

      {week && (
        <section className="admin-block">
          <h2 className="admin-heading">Week {week.week}</h2>
          <div className="muted small">Locks {formatDeadline(week.locks_at)}</div>

          <div className="inline-form">
            <input
              type="datetime-local"
              defaultValue={toDatetimeLocal(week.locks_at)}
              onBlur={(e) => {
                if (!e.target.value) return
                // datetime-local has no zone; the pool states deadlines in ET.
                const iso = new Date(`${e.target.value}:00-05:00`).toISOString()
                run(`Week ${week.week} deadline set`, () =>
                  supabase.from('survivor_weeks').update({ locks_at: iso }).eq('week', week.week),
                )
              }}
            />
            <span className="muted small">deadline (ET)</span>
          </div>

          <div className="btn-row">
            {(['upcoming', 'open', 'locked', 'final'] as WeekStatus[]).map((status) => (
              <button
                key={status}
                className={`btn ${week.status === status ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                disabled={busy || week.status === status}
                onClick={() => setStatus(week, status)}
              >
                {status}
              </button>
            ))}
          </div>

          <h3 className="admin-subheading">Results</h3>
          {pickedTeams.length === 0 ? (
            <p className="muted small">Nobody has picked a team this week yet.</p>
          ) : (
            <div className="result-rows">
              {pickedTeams.map((team) => {
                const current = resultFor.get(`${week.week}:${team.abbr}`)
                const takenBy = picks
                  .filter((p) => p.week === week.week && p.team === team.abbr)
                  .map((p) => nameById.get(p.user_id) ?? 'Member')
                return (
                  <div key={team.abbr} className="result-row">
                    <div className="rr-team">
                      <strong>{team.name}</strong>
                      <span className="muted small">{takenBy.join(', ')}</span>
                    </div>
                    <div className="btn-row">
                      {(['win', 'loss', 'tie'] as Outcome[]).map((outcome) => (
                        <button
                          key={outcome}
                          className={`btn btn-sm ${current === outcome ? 'btn-primary' : 'btn-secondary'}`}
                          disabled={busy}
                          onClick={() => setResult(team.abbr, outcome)}
                        >
                          {outcome}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {week && week.status === 'open' && (
        <section className="admin-block">
          <h2 className="admin-heading">Still need a pick — Week {week.week}</h2>
          <p className="muted small">
            Alive players with nothing locked in. A missed deadline is a strike, so this is
            who to nudge before {formatDeadline(week.locks_at)}.
          </p>
          {missingPicks.length === 0 ? (
            <p className="muted small">Everyone still alive has picked.</p>
          ) : (
            <div className="nudge-list">
              {missingPicks.map((row) => (
                <span key={row.userId} className="nudge-name">
                  {row.name}
                  {row.realName && <span className="nudge-real"> · {row.realName}</span>}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="admin-block">
        <h2 className="admin-heading">Entry fees</h2>
        <div className="money-row">
          <div className="money-cell in">
            <div className="money-value">{pool?.collectedLabel ?? '$0'}</div>
            <div className="money-label">Collected</div>
          </div>
          <div className="money-cell owed">
            <div className="money-value">{pool?.outstandingLabel ?? '$0'}</div>
            <div className="money-label">Outstanding</div>
          </div>
          <div className="money-cell">
            <div className="money-value">{pool?.unpaidCount ?? 0}</div>
            <div className="money-label">Unpaid</div>
          </div>
          <div className="money-cell">
            <div className="money-value">{pool?.potLabel ?? '$0'}</div>
            <div className="money-label">Full pot</div>
          </div>
        </div>

        <p className="muted small">
          Players see a "pay now" button using the link below. Nothing is charged here — they pay
          you directly, and you mark them paid.
        </p>
        <div className="settings-grid">
          <label>
            Payment handle (shown to players)
            <input
              defaultValue={settings.payment_handle ?? ''}
              placeholder="@Bryon-Romp"
              disabled={busy}
              onBlur={(e) =>
                run('Payment handle updated', () =>
                  supabase
                    .from('survivor_settings')
                    .update({ payment_handle: e.target.value.trim() || null })
                    .eq('id', true),
                )
              }
            />
          </label>
          <label>
            Payment link
            <input
              defaultValue={settings.payment_url ?? ''}
              placeholder="https://venmo.com/u/Bryon-Romp"
              disabled={busy}
              onBlur={(e) => {
                const value = e.target.value.trim()
                if (value && !safePaymentUrl(value)) {
                  setError('That payment link is not a valid http(s) URL, so it was not saved.')
                  return
                }
                run('Payment link updated', () =>
                  supabase
                    .from('survivor_settings')
                    .update({ payment_url: value || null })
                    .eq('id', true),
                )
              }}
            />
          </label>
          <label>
            Unpaid players can pick
            <select
              value={String(!settings.require_payment_to_pick)}
              disabled={busy}
              onChange={(e) =>
                run('Payment rule updated', () =>
                  supabase
                    .from('survivor_settings')
                    .update({ require_payment_to_pick: e.target.value === 'false' })
                    .eq('id', true),
                )
              }
            >
              <option value="true">yes — picks stay open</option>
              <option value="false">no — lock picks until paid</option>
            </select>
          </label>
        </div>
        <label>
          Instructions shown to unpaid players
          <input
            defaultValue={settings.payment_instructions}
            disabled={busy}
            onBlur={(e) =>
              run('Payment instructions updated', () =>
                supabase
                  .from('survivor_settings')
                  .update({ payment_instructions: e.target.value.trim() })
                  .eq('id', true),
              )
            }
          />
        </label>
      </section>

      <section className="admin-block">
        <h2 className="admin-heading">Entrants ({entrants.length})</h2>
        {entrants.length === 0 ? (
          <p className="muted small">Nobody has joined yet.</p>
        ) : (
          <div className="entrant-rows">
            {pool?.standings.map((row) => {
              const entrant = entrants.find((en) => en.user_id === row.userId)
              return (
                <div key={row.userId} className="entrant-row">
                  <div>
                    <strong>{row.name}</strong>
                    {row.realName && <span className="admin-real-name">{row.realName}</span>}
                    <div className="muted small">{row.statusLabel}</div>
                    {entrant?.paid && entrant.paid_at && (
                      <div className="paid-when">
                        Paid {new Date(entrant.paid_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    className={`btn btn-sm ${entrant?.paid ? 'btn-primary' : 'btn-secondary'}`}
                    disabled={busy}
                    onClick={() =>
                      run(`${row.name} marked ${entrant?.paid ? 'unpaid' : 'paid'}`, () =>
                        supabase
                          .from('survivor_entrants')
                          .update({ paid: !entrant?.paid })
                          .eq('user_id', row.userId),
                      )
                    }
                  >
                    {entrant?.paid ? 'paid' : 'unpaid'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="admin-block">
        <h2 className="admin-heading">Rules</h2>
        <p className="muted small">
          Changing these changes both the posted rules and the scoring — they read from the same
          settings.
        </p>
        <div className="settings-grid">
          <label>
            Strikes to eliminate
            <select
              value={settings.strikes_to_eliminate}
              disabled={busy}
              onChange={(e) =>
                run('Format updated', () =>
                  supabase
                    .from('survivor_settings')
                    .update({ strikes_to_eliminate: Number(e.target.value) })
                    .eq('id', true),
                )
              }
            >
              <option value={1}>1 — single elimination</option>
              <option value={2}>2 — double elimination</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label>
            A tie counts as
            <select
              value={settings.tie_counts_as}
              disabled={busy}
              onChange={(e) =>
                run('Tie rule updated', () =>
                  supabase
                    .from('survivor_settings')
                    .update({ tie_counts_as: e.target.value })
                    .eq('id', true),
                )
              }
            >
              <option value="survive">a survive</option>
              <option value="loss">a loss</option>
            </select>
          </label>
          <label>
            BYE weeks per player
            <select
              value={settings.bye_weeks_per_player}
              disabled={busy}
              onChange={(e) =>
                run('BYE weeks updated', () =>
                  supabase
                    .from('survivor_settings')
                    .update({ bye_weeks_per_player: Number(e.target.value) })
                    .eq('id', true),
                )
              }
            >
              <option value={0}>none</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label>
            Missed pick
            <select
              value={settings.missed_pick_policy}
              disabled={busy}
              onChange={(e) =>
                run('Missed-pick policy updated', () =>
                  supabase
                    .from('survivor_settings')
                    .update({ missed_pick_policy: e.target.value })
                    .eq('id', true),
                )
              }
            >
              <option value="strike">costs a strike</option>
              <option value="record">is recorded only</option>
            </select>
          </label>
          <label>
            Entry fee
            <input
              type="number"
              min={0}
              defaultValue={settings.entry_fee}
              disabled={busy}
              onBlur={(e) =>
                run('Entry fee updated', () =>
                  supabase
                    .from('survivor_settings')
                    .update({ entry_fee: Number(e.target.value) })
                    .eq('id', true),
                )
              }
            />
          </label>
          <label>
            Buy-backs
            <select
              value={String(settings.allow_buy_backs)}
              disabled={busy}
              onChange={(e) =>
                run('Buy-back rule updated', () =>
                  supabase
                    .from('survivor_settings')
                    .update({ allow_buy_backs: e.target.value === 'true' })
                    .eq('id', true),
                )
              }
            >
              <option value="false">not allowed</option>
              <option value="true">allowed</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  )
}
