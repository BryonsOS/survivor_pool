/**
 * refresh-scores — records finished games into survivor_results.
 *
 * Runs on a schedule (see supabase/migrations/011_auto_results.sql) and, like
 * refresh-odds, checks a shared secret the database holds because pg_cron has no
 * user to sign in as.
 *
 * It only ever adds. survivor_apply_scores() skips any week already marked final
 * and never overwrites an existing row, so a commissioner's correction survives
 * every later run. Marking a week final stays a person's decision — that is what
 * costs somebody a strike.
 */

/** Completed games from up to three days back; that window covers Thursday through Monday night. */
const SCORES_ENDPOINT =
  'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/scores/'
const DAYS_FROM = 3

/** The free plan allows 500 credits a month, and this call costs 2. */
const MIN_MINUTES_BETWEEN_RUNS = 60

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY') ?? ''

interface ScoreEntry {
  name: string
  score: string | number | null
}
interface ScoredEvent {
  home_team: string
  away_team: string
  completed?: boolean
  scores?: ScoreEntry[] | null
}

function db(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Compares without leaking the answer through how long it took. */
function secretsMatch(expected: string, offered: string): boolean {
  if (expected.length !== offered.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ offered.charCodeAt(i)
  }
  return diff === 0
}

function log(fields: Record<string, unknown>) {
  return db('survivor_feed_runs', {
    method: 'POST',
    body: JSON.stringify({ kind: 'scores', ...fields }),
  })
}

function scoreOf(event: ScoredEvent, team: string): number | null {
  const entry = event.scores?.find((s) => s.name === team)
  if (!entry || entry.score === null || entry.score === undefined) return null
  const value = Number(entry.score)
  return Number.isFinite(value) ? value : null
}

Deno.serve(async (req: Request) => {
  // Failing to read the secret is our problem, not the caller's. Reporting it as
  // "not authorised" would make a transient blip look exactly like a rejected
  // caller, and the run would vanish without a trace in the feed log.
  let expected: string | undefined
  try {
    const res = await db('survivor_cron_config?select=refresh_secret&limit=1')
    if (!res.ok) throw new Error(`config read returned ${res.status}`)
    expected = (await res.json())?.[0]?.refresh_secret
  } catch (error) {
    const detail = `could not read the shared secret: ${error instanceof Error ? error.message : error}`
    await log({ ok: false, detail: detail.slice(0, 500) }).catch(() => {})
    return json({ error: 'Configuration unavailable' }, 503)
  }
  if (!expected) {
    await log({ ok: false, detail: 'no shared secret is configured' }).catch(() => {})
    return json({ error: 'Configuration unavailable' }, 503)
  }
  // A wrong secret is not logged: an unauthenticated caller must not be able to
  // fill the commissioner's panel with noise.
  if (!secretsMatch(expected, req.headers.get('x-pool-secret') ?? '')) {
    return json({ error: 'Not authorised' }, 401)
  }

  if (!ODDS_API_KEY) {
    await log({ ok: false, detail: 'ODDS_API_KEY is not set' })
    return json({ error: 'ODDS_API_KEY is not set' }, 500)
  }

  const force = new URL(req.url).searchParams.get('force') === '1'

  const lastRun = await db(
    'survivor_feed_runs?select=ran_at&kind=eq.scores&ok=is.true&order=ran_at.desc&limit=1',
  )
    .then((r) => r.json())
    .catch(() => null)
  const lastAt = lastRun?.[0]?.ran_at ? new Date(lastRun[0].ran_at).getTime() : 0
  if (!force && Date.now() - lastAt < MIN_MINUTES_BETWEEN_RUNS * 60_000) {
    return json({ skipped: 'ran recently', last_run: lastRun[0].ran_at })
  }

  // Nothing has kicked off lately — do not spend a credit to be told so. This is
  // what keeps the job free for the eight months there is no football.
  const anyGames = await db('rpc/survivor_recent_games_exist', {
    method: 'POST',
    body: '{}',
  })
    .then((r) => r.json())
    .catch(() => true)
  if (!force && anyGames === false) {
    return json({ skipped: 'no games in the last three days' })
  }

  try {
    const teams: { abbr: string; name: string }[] = await db(
      'survivor_teams?select=abbr,name',
    ).then((r) => r.json())
    const abbrByName = new Map(teams.map((t) => [t.name, t.abbr]))

    const params = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      daysFrom: String(DAYS_FROM),
    })
    const response = await fetch(`${SCORES_ENDPOINT}?${params}`)
    // The month's remaining allowance rides along on every response.
    const creditsHeader = response.headers.get('x-requests-remaining')
    const creditsRemaining = creditsHeader === null ? null : Number(creditsHeader)

    if (!response.ok) {
      // The body can echo the query string, so report the status only.
      throw new Error(`The Odds API returned ${response.status}`)
    }
    const events: ScoredEvent[] = await response.json()

    const payload: {
      away: string
      home: string
      away_score: number
      home_score: number
    }[] = []
    let unfinished = 0

    for (const event of events) {
      if (!event.completed) {
        unfinished++
        continue
      }
      const home = abbrByName.get(event.home_team)
      const away = abbrByName.get(event.away_team)
      if (!home || !away) continue

      const homeScore = scoreOf(event, event.home_team)
      const awayScore = scoreOf(event, event.away_team)
      if (homeScore === null || awayScore === null) continue

      payload.push({ away, home, away_score: awayScore, home_score: homeScore })
    }

    const recorded: number = await db('rpc/survivor_apply_scores', {
      method: 'POST',
      body: JSON.stringify({ p_scores: payload }),
    }).then((r) => r.json())

    const detail =
      `${payload.length} finished games read, ${recorded} results recorded` +
      (unfinished ? `, ${unfinished} still in progress` : '')

    await log({
      ok: true,
      games_updated: recorded,
      detail,
      credits_remaining: Number.isFinite(creditsRemaining) ? creditsRemaining : null,
    })

    return json({ ok: true, results_recorded: recorded, detail })
  } catch (error) {
    const detail = String(error instanceof Error ? error.message : error).slice(0, 500)
    await log({ ok: false, detail })
    return json({ ok: false, detail }, 500)
  }
})
