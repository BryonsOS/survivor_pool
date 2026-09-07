/**
 * refresh-odds — pulls NFL moneylines from The Odds API into survivor_games.
 *
 * Runs on a schedule (see supabase/migrations/009_schedule_odds_refresh.sql). It is
 * deployed with JWT verification off, because pg_cron has no user to sign in as, so
 * the first thing it does is check a shared secret that only the database knows.
 *
 * Books disagree, so the numbers stored are a consensus: each bookmaker's pair is
 * stripped of its margin first, the median across books is taken, and the result is
 * written back as a moneyline pair. Storing a moneyline rather than a percentage
 * keeps the column meaning the same thing whether a human or this job filled it in.
 */

const ODDS_ENDPOINT = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/'

/** The free plan allows 500 calls a month. Refuse to spend them faster than this. */
const MIN_MINUTES_BETWEEN_RUNS = 30

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY') ?? ''

interface Outcome {
  name: string
  price: number
}
interface Event {
  home_team: string
  away_team: string
  bookmakers?: { markets?: { key: string; outcomes?: Outcome[] }[] }[]
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

function impliedProbability(moneyline: number): number {
  if (!Number.isFinite(moneyline) || moneyline === 0) return 0
  return moneyline > 0 ? 100 / (moneyline + 100) : -moneyline / (-moneyline + 100)
}

/** Inverse of the above. 0.5 becomes -100, the pick-'em price. */
function probabilityToMoneyline(p: number): number {
  const clamped = Math.min(Math.max(p, 0.005), 0.995)
  return clamped >= 0.5
    ? -Math.round((100 * clamped) / (1 - clamped))
    : Math.round((100 * (1 - clamped)) / clamped)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The consensus chance that the home team wins, with each book's margin removed
 * before it gets a vote. Null when no book quoted both sides.
 */
function consensusHomeProbability(event: Event): number | null {
  const votes: number[] = []

  for (const book of event.bookmakers ?? []) {
    const h2h = book.markets?.find((market) => market.key === 'h2h')
    if (!h2h) continue

    const homePrice = h2h.outcomes?.find((o) => o.name === event.home_team)?.price
    const awayPrice = h2h.outcomes?.find((o) => o.name === event.away_team)?.price
    if (typeof homePrice !== 'number' || typeof awayPrice !== 'number') continue

    const home = impliedProbability(homePrice)
    const away = impliedProbability(awayPrice)
    const total = home + away
    if (total <= 0) continue

    votes.push(home / total)
  }

  return votes.length ? median(votes) : null
}

Deno.serve(async (req: Request) => {
  // 1. Only the scheduled job gets in.
  const configRows = await db('survivor_cron_config?select=refresh_secret&limit=1')
    .then((r) => r.json())
    .catch(() => null)
  const expected = configRows?.[0]?.refresh_secret
  if (!expected || !secretsMatch(expected, req.headers.get('x-pool-secret') ?? '')) {
    return json({ error: 'Not authorised' }, 401)
  }

  if (!ODDS_API_KEY) {
    await db('survivor_odds_runs', {
      method: 'POST',
      body: JSON.stringify({ ok: false, detail: 'ODDS_API_KEY is not set' }),
    })
    return json({ error: 'ODDS_API_KEY is not set' }, 500)
  }

  // 2. Do not burn the monthly allowance on a retry loop.
  const lastRun = await db('survivor_odds_runs?select=ran_at&ok=is.true&order=ran_at.desc&limit=1')
    .then((r) => r.json())
    .catch(() => null)
  const lastAt = lastRun?.[0]?.ran_at ? new Date(lastRun[0].ran_at).getTime() : 0
  const force = new URL(req.url).searchParams.get('force') === '1'
  if (!force && Date.now() - lastAt < MIN_MINUTES_BETWEEN_RUNS * 60_000) {
    return json({ skipped: 'ran recently', last_run: lastRun[0].ran_at })
  }

  try {
    // 3. The Odds API names teams in full; the schedule uses abbreviations.
    const teams: { abbr: string; name: string }[] = await db(
      'survivor_teams?select=abbr,name',
    ).then((r) => r.json())
    const abbrByName = new Map(teams.map((t) => [t.name, t.abbr]))

    const params = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      regions: 'us',
      markets: 'h2h',
      oddsFormat: 'american',
    })
    const response = await fetch(`${ODDS_ENDPOINT}?${params}`)
    if (!response.ok) {
      // The body can echo the query string, so report the status only.
      throw new Error(`The Odds API returned ${response.status}`)
    }
    const events: Event[] = await response.json()

    const payload: {
      away: string
      home: string
      away_ml: number
      home_ml: number
    }[] = []
    let unmatched = 0

    for (const event of events) {
      const home = abbrByName.get(event.home_team)
      const away = abbrByName.get(event.away_team)
      if (!home || !away) {
        unmatched++
        continue
      }
      const homeProbability = consensusHomeProbability(event)
      if (homeProbability === null) continue

      payload.push({
        away,
        home,
        home_ml: probabilityToMoneyline(homeProbability),
        away_ml: probabilityToMoneyline(1 - homeProbability),
      })
    }

    const updated: number = await db('rpc/survivor_apply_odds', {
      method: 'POST',
      body: JSON.stringify({ p_odds: payload }),
    }).then((r) => r.json())

    const detail =
      `${events.length} events from the book, ${payload.length} priced` +
      (unmatched ? `, ${unmatched} with unrecognised team names` : '')

    await db('survivor_odds_runs', {
      method: 'POST',
      body: JSON.stringify({ ok: true, games_updated: updated, detail }),
    })

    return json({ ok: true, games_updated: updated, detail })
  } catch (error) {
    const detail = String(error instanceof Error ? error.message : error).slice(0, 500)
    await db('survivor_odds_runs', {
      method: 'POST',
      body: JSON.stringify({ ok: false, detail }),
    })
    return json({ ok: false, detail }, 500)
  }
})
