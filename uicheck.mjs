/**
 * UI verification harness. Serves the built app and stubs the Supabase REST/auth
 * endpoints in the browser, so every page renders against realistic mid-season
 * data without touching the live database. Not part of the app build.
 */
import { chromium } from 'playwright'

const REF = 'cnchsowyukaioujfrups'
const ME = 'u-me'
const OUT = process.env.SHOT_DIR || '/tmp'
const BASE = 'http://localhost:4174'

const TEAMS = [
  ['BUF','Buffalo Bills','AFC','East'],['MIA','Miami Dolphins','AFC','East'],
  ['NE','New England Patriots','AFC','East'],['NYJ','New York Jets','AFC','East'],
  ['BAL','Baltimore Ravens','AFC','North'],['CIN','Cincinnati Bengals','AFC','North'],
  ['CLE','Cleveland Browns','AFC','North'],['PIT','Pittsburgh Steelers','AFC','North'],
  ['HOU','Houston Texans','AFC','South'],['IND','Indianapolis Colts','AFC','South'],
  ['JAX','Jacksonville Jaguars','AFC','South'],['TEN','Tennessee Titans','AFC','South'],
  ['DEN','Denver Broncos','AFC','West'],['KC','Kansas City Chiefs','AFC','West'],
  ['LV','Las Vegas Raiders','AFC','West'],['LAC','Los Angeles Chargers','AFC','West'],
  ['DAL','Dallas Cowboys','NFC','East'],['NYG','New York Giants','NFC','East'],
  ['PHI','Philadelphia Eagles','NFC','East'],['WAS','Washington Commanders','NFC','East'],
  ['CHI','Chicago Bears','NFC','North'],['DET','Detroit Lions','NFC','North'],
  ['GB','Green Bay Packers','NFC','North'],['MIN','Minnesota Vikings','NFC','North'],
  ['ATL','Atlanta Falcons','NFC','South'],['CAR','Carolina Panthers','NFC','South'],
  ['NO','New Orleans Saints','NFC','South'],['TB','Tampa Bay Buccaneers','NFC','South'],
  ['ARI','Arizona Cardinals','NFC','West'],['LAR','Los Angeles Rams','NFC','West'],
  ['SF','San Francisco 49ers','NFC','West'],['SEA','Seattle Seahawks','NFC','West'],
].map(([abbr, name, conference, division]) => ({ abbr, name, conference, division }))

const PROFILES = [
  { id: ME, display_name: 'Bryon', is_admin: true },
  { id: 'u-mike', display_name: 'Mike Ross', is_admin: false },
  { id: 'u-sara', display_name: 'Sara P', is_admin: false },
  { id: 'u-danny', display_name: 'Danny K', is_admin: false },
  { id: 'u-jules', display_name: 'Jules', is_admin: false },
]

const SETTINGS = {
  id: true, pool_name: 'SOABOS Survivor Pool', season: 2026, total_weeks: 18,
  strikes_to_eliminate: 2, tie_counts_as: 'survive', bye_weeks_per_player: 0,
  allow_buy_backs: false, buy_back_fee: 0, missed_pick_policy: 'strike',
  entry_fee: 25, pick_deadline_label: 'Sunday 1:00 PM ET',
  payout_note: 'Winner takes the pot. If more than one player is still alive after the final week, survivors split evenly.',
}

// 1:00 PM ET each week. US DST ends Nov 1 2026, which is week 8 — from there the
// same wall-clock time is one hour later in UTC. (The database computes this itself
// via `at time zone 'America/New_York'`; this fixture just mirrors it.)
const WEEKS = Array.from({ length: 18 }, (_, i) => ({
  week: i + 1,
  locks_at: new Date(Date.UTC(2026, 8, 13 + i * 7, i + 1 < 8 ? 17 : 18, 0)).toISOString(),
  status: i < 2 ? 'final' : i === 2 ? 'open' : 'upcoming',
}))
// put the open week's deadline in the near future so the countdown renders
WEEKS[2].locks_at = new Date(Date.now() + 1000 * 60 * 60 * 52).toISOString()

const RESULTS = [
  { week: 1, team: 'DET', outcome: 'win' }, { week: 1, team: 'KC', outcome: 'win' },
  { week: 1, team: 'BUF', outcome: 'loss' }, { week: 1, team: 'PHI', outcome: 'win' },
  { week: 1, team: 'SF', outcome: 'tie' },
  { week: 2, team: 'BAL', outcome: 'win' }, { week: 2, team: 'GB', outcome: 'loss' },
  { week: 2, team: 'KC', outcome: 'loss' }, { week: 2, team: 'MIN', outcome: 'win' },
  { week: 2, team: 'HOU', outcome: 'win' },
]

let pid = 0
const p = (user_id, week, team) => ({ id: `p${pid++}`, user_id, week, team, is_bye: false })
const PICKS = [
  p(ME, 1, 'DET'), p('u-mike', 1, 'KC'), p('u-sara', 1, 'BUF'), p('u-danny', 1, 'PHI'), p('u-jules', 1, 'SF'),
  p(ME, 2, 'BAL'), p('u-mike', 2, 'GB'), p('u-sara', 2, 'KC'), p('u-danny', 2, 'MIN'), p('u-jules', 2, 'HOU'),
  p(ME, 3, 'TB'), p('u-mike', 3, 'LAC'), p('u-danny', 3, 'CIN'),
]

const ENTRANTS = PROFILES.map((pr, i) => ({
  user_id: pr.id, joined_at: '2026-09-01T00:00:00Z', paid: i < 3,
}))

function jwt(sub) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({
    sub, role: 'authenticated', aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 86400,
  })}.stub`
}

const SESSION = {
  access_token: jwt(ME),
  refresh_token: 'stub-refresh',
  token_type: 'bearer',
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: {
    id: ME, aud: 'authenticated', role: 'authenticated',
    email: 'bryon@example.com', app_metadata: { provider: 'email' },
    user_metadata: { display_name: 'Bryon' }, created_at: '2026-09-01T00:00:00Z',
  },
}

// table -> rows, matching what RLS would return for this signed-in member
const TABLES = {
  profiles: PROFILES,
  survivor_settings: [SETTINGS],
  survivor_teams: TEAMS,
  survivor_weeks: WEEKS,
  survivor_results: RESULTS,
  survivor_entrants: ENTRANTS,
  // admin sees everything; a plain member would get only their own open-week pick
  survivor_picks: PICKS,
  survivor_invite: [{ invite_code: 'SURVIVE2026' }],
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
})
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
const problems = []

await context.route('**/auth/v1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) }),
)

await context.route('**/rest/v1/**', (route) => {
  const url = new URL(route.request().url())
  const table = url.pathname.split('/rest/v1/')[1]?.split('?')[0]
  let rows = TABLES[table] ?? []

  // honour the eq. filters the app actually sends
  for (const [key, raw] of url.searchParams) {
    if (key === 'select' || key === 'order' || key === 'limit') continue
    if (raw.startsWith('eq.')) {
      const want = raw.slice(3)
      rows = rows.filter((row) => String(row[key]) === want)
    }
  }

  const accept = route.request().headers()['accept'] ?? ''
  const single = accept.includes('vnd.pgrst.object+json')
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(single ? (rows[0] ?? null) : rows),
  })
})

const page = await context.newPage()
page.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) problems.push(`CONSOLE ${m.text()}`)
})

await page.addInitScript(
  ([ref, session]) => {
    window.localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session))
  },
  [REF, SESSION],
)

const routes = [
  ['/', 'pick'],
  ['/standings', 'standings'],
  ['/season', 'season'],
  ['/rules', 'rules'],
  ['/admin', 'admin'],
]

for (const [path, name] of routes) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  if (name === 'season') {
    const first = page.locator('.week-head').first()
    if (await first.count()) await first.click()
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: `${OUT}/ui-${name}.png`, fullPage: true })
  const h1 = await page.locator('h1').first().textContent().catch(() => null)
  console.log(`${name.padEnd(10)} h1=${JSON.stringify(h1)}`)
}

// the signed-out view
await context.clearCookies()
const anon = await context.newPage()
await anon.addInitScript(([ref]) => window.localStorage.removeItem(`sb-${ref}-auth-token`), [REF])
await anon.goto(BASE + '/', { waitUntil: 'networkidle' })
await anon.waitForTimeout(500)
await anon.screenshot({ path: `${OUT}/ui-auth.png`, fullPage: true })
console.log(`auth       h1=${JSON.stringify(await anon.locator('h1').first().textContent())}`)

console.log(problems.length ? `\nPROBLEMS:\n${problems.join('\n')}` : '\nNo console or page errors.')
await browser.close()
