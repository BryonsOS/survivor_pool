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
  entry_fee: 25, pick_deadline_label: 'the first kickoff of each week',
  payout_note: 'Winner takes the pot. If more than one player is still alive after the final week, survivors split evenly.',
}

// Real 2026 games for weeks 9-11, so the board shows true opponents and byes.
// Week 11 is the open week and has six teams on a bye (ATL CLE GB LAR NE SEA).
const GAMES = [
  { id:'g0', week:9, away:'JAX', home:'BAL', neutral_site:false, kickoff_at:'2026-11-06T01:15:00.000Z', tv:'AMZ', note:null },
  { id:'g1', week:9, away:'CIN', home:'ATL', neutral_site:true, kickoff_at:'2026-11-08T14:30:00.000Z', tv:'NFLN', note:'Madrid' },
  { id:'g2', week:9, away:'DEN', home:'CAR', neutral_site:false, kickoff_at:'2026-11-08T18:00:00.000Z', tv:'CBS', note:null },
  { id:'g3', week:9, away:'DAL', home:'IND', neutral_site:false, kickoff_at:'2026-11-08T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g4', week:9, away:'NYJ', home:'KC', neutral_site:false, kickoff_at:'2026-11-08T18:00:00.000Z', tv:'CBS', note:null },
  { id:'g5', week:9, away:'DET', home:'MIA', neutral_site:false, kickoff_at:'2026-11-08T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g6', week:9, away:'CLE', home:'NO', neutral_site:false, kickoff_at:'2026-11-08T18:00:00.000Z', tv:'CBS', note:null },
  { id:'g7', week:9, away:'NYG', home:'PHI', neutral_site:false, kickoff_at:'2026-11-08T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g8', week:9, away:'LAR', home:'WAS', neutral_site:false, kickoff_at:'2026-11-08T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g9', week:9, away:'HOU', home:'LAC', neutral_site:false, kickoff_at:'2026-11-08T21:05:00.000Z', tv:'CBS', note:null },
  { id:'g10', week:9, away:'LV', home:'SF', neutral_site:false, kickoff_at:'2026-11-08T21:05:00.000Z', tv:'CBS', note:null },
  { id:'g11', week:9, away:'GB', home:'NE', neutral_site:false, kickoff_at:'2026-11-08T21:25:00.000Z', tv:'FOX', note:null },
  { id:'g12', week:9, away:'ARI', home:'SEA', neutral_site:false, kickoff_at:'2026-11-08T21:25:00.000Z', tv:'FOX', note:null },
  { id:'g13', week:9, away:'TB', home:'CHI', neutral_site:false, kickoff_at:'2026-11-09T01:20:00.000Z', tv:'NBC*', note:null },
  { id:'g14', week:9, away:'BUF', home:'MIN', neutral_site:false, kickoff_at:'2026-11-10T01:15:00.000Z', tv:'ESPN/ABC', note:null },
  { id:'g15', week:10, away:'WAS', home:'NYG', neutral_site:false, kickoff_at:'2026-11-13T01:15:00.000Z', tv:'AMZ', note:null },
  { id:'g16', week:10, away:'NE', home:'DET', neutral_site:true, kickoff_at:'2026-11-15T14:30:00.000Z', tv:'FOX', note:'Munich' },
  { id:'g17', week:10, away:'KC', home:'ATL', neutral_site:false, kickoff_at:'2026-11-15T18:00:00.000Z', tv:'CBS', note:null },
  { id:'g18', week:10, away:'HOU', home:'CLE', neutral_site:false, kickoff_at:'2026-11-15T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g19', week:10, away:'MIN', home:'GB', neutral_site:false, kickoff_at:'2026-11-15T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g20', week:10, away:'MIA', home:'IND', neutral_site:false, kickoff_at:'2026-11-15T18:00:00.000Z', tv:'CBS', note:null },
  { id:'g21', week:10, away:'CAR', home:'NO', neutral_site:false, kickoff_at:'2026-11-15T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g22', week:10, away:'BUF', home:'NYJ', neutral_site:false, kickoff_at:'2026-11-15T18:00:00.000Z', tv:'CBS', note:null },
  { id:'g23', week:10, away:'JAX', home:'TEN', neutral_site:false, kickoff_at:'2026-11-15T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g24', week:10, away:'LAR', home:'ARI', neutral_site:false, kickoff_at:'2026-11-15T21:05:00.000Z', tv:'CBS', note:null },
  { id:'g25', week:10, away:'SEA', home:'LV', neutral_site:false, kickoff_at:'2026-11-15T21:05:00.000Z', tv:'CBS', note:null },
  { id:'g26', week:10, away:'SF', home:'DAL', neutral_site:false, kickoff_at:'2026-11-15T21:25:00.000Z', tv:'FOX', note:null },
  { id:'g27', week:10, away:'PIT', home:'CIN', neutral_site:false, kickoff_at:'2026-11-16T01:20:00.000Z', tv:'NBC*', note:null },
  { id:'g28', week:10, away:'LAC', home:'BAL', neutral_site:false, kickoff_at:'2026-11-17T01:15:00.000Z', tv:'ESPN', note:null },
  { id:'g29', week:11, away:'IND', home:'HOU', neutral_site:false, kickoff_at:'2026-11-20T01:15:00.000Z', tv:'AMZ', note:null },
  { id:'g30', week:11, away:'MIA', home:'BUF', neutral_site:false, kickoff_at:'2026-11-22T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g31', week:11, away:'BAL', home:'CAR', neutral_site:false, kickoff_at:'2026-11-22T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g32', week:11, away:'NO', home:'CHI', neutral_site:false, kickoff_at:'2026-11-22T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g33', week:11, away:'TEN', home:'DAL', neutral_site:false, kickoff_at:'2026-11-22T18:00:00.000Z', tv:'FOX', note:null },
  { id:'g34', week:11, away:'TB', home:'DET', neutral_site:false, kickoff_at:'2026-11-22T18:00:00.000Z', tv:'CBS', note:null },
  { id:'g35', week:11, away:'ARI', home:'KC', neutral_site:false, kickoff_at:'2026-11-22T18:00:00.000Z', tv:'CBS', note:null },
  { id:'g36', week:11, away:'JAX', home:'NYG', neutral_site:false, kickoff_at:'2026-11-22T18:00:00.000Z', tv:'CBS', note:null },
  { id:'g37', week:11, away:'NYJ', home:'LAC', neutral_site:false, kickoff_at:'2026-11-22T21:05:00.000Z', tv:'FOX', note:null },
  { id:'g38', week:11, away:'LV', home:'DEN', neutral_site:false, kickoff_at:'2026-11-22T21:25:00.000Z', tv:'CBS', note:null },
  { id:'g39', week:11, away:'PIT', home:'PHI', neutral_site:false, kickoff_at:'2026-11-22T21:25:00.000Z', tv:'CBS', note:null },
  { id:'g40', week:11, away:'MIN', home:'SF', neutral_site:true, kickoff_at:'2026-11-23T01:20:00.000Z', tv:'NBC', note:'Mexico City' },
  { id:'g41', week:11, away:'CIN', home:'WAS', neutral_site:false, kickoff_at:'2026-11-24T01:15:00.000Z', tv:'ESPN', note:null },
]

const OPEN_WEEK = 11
const WEEKS = Array.from({ length: 18 }, (_, i) => {
  const week = i + 1
  const first = GAMES.filter((g) => g.week === week && g.kickoff_at)
    .map((g) => g.kickoff_at).sort()[0] ?? null
  return {
    week,
    locks_at: first ?? new Date(Date.UTC(2026, 8, 13 + i * 7, week < 8 ? 17 : 18, 0)).toISOString(),
    status: week < OPEN_WEEK ? (week >= OPEN_WEEK - 2 ? 'final' : 'upcoming')
      : week === OPEN_WEEK ? 'open' : 'upcoming',
  }
})
// put the open week's deadline in the near future so the countdown renders
WEEKS[OPEN_WEEK - 1].locks_at = new Date(Date.now() + 1000 * 60 * 60 * 52).toISOString()

const RESULTS = [
  { week: 9, team: 'KC', outcome: 'win' }, { week: 9, team: 'PHI', outcome: 'win' },
  { week: 9, team: 'SEA', outcome: 'loss' }, { week: 9, team: 'BAL', outcome: 'win' },
  { week: 9, team: 'SF', outcome: 'tie' },
  { week: 10, team: 'DET', outcome: 'win' }, { week: 10, team: 'GB', outcome: 'loss' },
  { week: 10, team: 'BAL', outcome: 'loss' }, { week: 10, team: 'NO', outcome: 'win' },
  { week: 10, team: 'CLE', outcome: 'win' },
]

let pid = 0
const p = (user_id, week, team) => ({ id: `p${pid++}`, user_id, week, team, is_bye: false })
const PICKS = [
  p(ME, 9, 'KC'), p('u-mike', 9, 'PHI'), p('u-sara', 9, 'SEA'), p('u-danny', 9, 'BAL'), p('u-jules', 9, 'SF'),
  p(ME, 10, 'DET'), p('u-mike', 10, 'GB'), p('u-sara', 10, 'BAL'), p('u-danny', 10, 'NO'), p('u-jules', 10, 'CLE'),
  p(ME, 11, 'PHI'), p('u-mike', 11, 'KC'), p('u-danny', 11, 'DET'),
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
  survivor_games: GAMES,
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
