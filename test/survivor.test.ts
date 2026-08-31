import test from 'node:test'
import assert from 'node:assert/strict'
import { availableTeams, buildPool, buildRules } from '../src/lib/survivor.ts'
import type { PoolInput } from '../src/lib/survivor.ts'
import type { PoolSettings, Team } from '../src/lib/types.ts'

const teams: Team[] = ['DET', 'GB', 'KC', 'BUF', 'SF', 'DAL', 'PHI', 'MIA'].map((abbr) => ({
  abbr,
  name: `${abbr} Team`,
  conference: 'NFC',
  division: 'North',
}))

const settings: PoolSettings = {
  id: true,
  pool_name: 'Test Pool',
  season: 2026,
  total_weeks: 5,
  strikes_to_eliminate: 2,
  tie_counts_as: 'survive',
  bye_weeks_per_player: 0,
  allow_buy_backs: false,
  buy_back_fee: 0,
  missed_pick_policy: 'strike',
  entry_fee: 20,
  pick_deadline_label: 'Sunday 1:00 PM ET',
  payout_note: 'Winner takes the pot.',
}

const profiles = [
  { id: 'a', display_name: 'Alice', is_admin: false },
  { id: 'b', display_name: 'Bob', is_admin: false },
  { id: 'c', display_name: 'Cara', is_admin: false },
  { id: 'd', display_name: 'Dan', is_admin: false },
]

const entrants = profiles.map((p) => ({ user_id: p.id, joined_at: '', paid: true }))

let pickId = 0
const pick = (user_id: string, week: number, team: string | null, is_bye = false) => ({
  id: `p${pickId++}`,
  user_id,
  week,
  team,
  is_bye,
})

function base(overrides: Partial<PoolInput> = {}): PoolInput {
  return {
    settings,
    teams,
    profiles,
    entrants,
    weeks: [
      { week: 1, locks_at: null, status: 'final' },
      { week: 2, locks_at: null, status: 'final' },
      { week: 3, locks_at: null, status: 'final' },
      { week: 4, locks_at: null, status: 'open' },
      { week: 5, locks_at: null, status: 'upcoming' },
    ],
    results: [
      { week: 1, team: 'DET', outcome: 'win' },
      { week: 1, team: 'GB', outcome: 'loss' },
      { week: 1, team: 'KC', outcome: 'tie' },
      { week: 1, team: 'BUF', outcome: 'loss' },
      { week: 2, team: 'SF', outcome: 'win' },
      { week: 2, team: 'DAL', outcome: 'loss' },
      { week: 2, team: 'PHI', outcome: 'win' },
      { week: 2, team: 'MIA', outcome: 'loss' },
      { week: 3, team: 'MIA', outcome: 'win' },
      { week: 3, team: 'KC', outcome: 'win' },
      { week: 3, team: 'BUF', outcome: 'win' },
    ],
    picks: [
      pick('a', 1, 'DET'), pick('b', 1, 'GB'), pick('c', 1, 'KC'), pick('d', 1, 'BUF'),
      pick('a', 2, 'SF'), pick('b', 2, 'DAL'), pick('c', 2, 'PHI'), pick('d', 2, 'MIA'),
      pick('a', 3, 'MIA'), pick('b', 3, 'KC'), pick('c', 3, 'BUF'),
      pick('a', 4, 'GB'),
    ],
    ...overrides,
  }
}

const by = (input: PoolInput) =>
  Object.fromEntries(buildPool(input).standings.map((s) => [s.name, s]))

test('a win advances you with no strike', () => {
  const s = by(base())
  assert.equal(s.Alice.strikes, 0)
  assert.equal(s.Alice.status, 'alive')
})

test('two losses eliminate under double elimination', () => {
  const s = by(base())
  assert.equal(s.Bob.strikes, 2)
  assert.equal(s.Bob.status, 'eliminated')
  assert.equal(s.Bob.eliminatedWeek, 2)
})

test('a tie survives by default and still burns the team', () => {
  const s = by(base())
  assert.equal(s.Cara.strikes, 0)
  assert.equal(s.Cara.status, 'alive')
  assert.ok(s.Cara.teamsUsed.some((t) => t.abbr === 'KC'))
})

test('a tie can be configured to cost a strike', () => {
  const s = by(base({ settings: { ...settings, tie_counts_as: 'loss' } }))
  assert.equal(s.Cara.strikes, 1)
})

test('single elimination knocks you out on the first loss', () => {
  const s = by(base({ settings: { ...settings, strikes_to_eliminate: 1 } }))
  assert.equal(s.Bob.status, 'eliminated')
  assert.equal(s.Bob.eliminatedWeek, 1)
})

test('every pick burns its team, win or lose', () => {
  const s = by(base())
  assert.deepEqual(s.Cara.teamsUsed.map((t) => t.abbr), ['KC', 'PHI', 'BUF'])
  assert.equal(s.Cara.teamsRemaining, teams.length - 3)
})

test('eliminated entrants stop being graded and strikes stay capped', () => {
  const s = by(base())
  assert.equal(s.Bob.history.find((h) => h.week === 3)?.outcome, 'out')
  assert.equal(s.Bob.strikes, 2)
})

test('a missed pick costs a strike when the policy says so', () => {
  const s = by(base({
    weeks: [{ week: 1, locks_at: null, status: 'final' }],
    picks: [pick('a', 1, 'DET')],
  }))
  assert.equal(s.Bob.history.find((h) => h.week === 1)?.outcome, 'missed')
  assert.equal(s.Bob.strikes, 1)
})

test('repeated missed picks eliminate you', () => {
  const s = by(base({ picks: [pick('a', 1, 'DET')] }))
  assert.equal(s.Bob.strikes, 2)
  assert.equal(s.Bob.status, 'eliminated')
  assert.equal(s.Bob.eliminatedWeek, 2)
})

test('a missed pick can be recorded without a strike', () => {
  const s = by(base({
    settings: { ...settings, missed_pick_policy: 'record' },
    picks: [pick('a', 1, 'DET')],
  }))
  assert.equal(s.Bob.strikes, 0)
})

test('an ungraded week never costs a strike', () => {
  const s = by(base({
    weeks: [{ week: 1, locks_at: null, status: 'open' }],
    picks: [pick('a', 1, 'GB')],
    results: [{ week: 1, team: 'GB', outcome: 'loss' }],
  }))
  assert.equal(s.Alice.strikes, 0)
  assert.equal(s.Alice.history.find((h) => h.week === 1)?.outcome, 'loss')
})

test('a pick with no result yet is pending, not a strike', () => {
  const s = by(base({
    weeks: [{ week: 1, locks_at: null, status: 'final' }],
    picks: [pick('a', 1, 'DET')],
    results: [],
  }))
  assert.equal(s.Alice.history[0].outcome, 'pending')
  assert.equal(s.Alice.strikes, 0)
})

test('BYE weeks are free until they run out', () => {
  const s = by(base({
    settings: { ...settings, bye_weeks_per_player: 1 },
    weeks: [
      { week: 1, locks_at: null, status: 'final' },
      { week: 2, locks_at: null, status: 'final' },
    ],
    picks: [pick('a', 1, null, true), pick('a', 2, null, true)],
    results: [],
  }))
  assert.equal(s.Alice.history[0].outcome, 'bye')
  assert.equal(s.Alice.history[1].outcome, 'missed')
  assert.equal(s.Alice.strikes, 1)
  assert.equal(s.Alice.teamsUsed.length, 0, 'a BYE burns no team')
})

test('the last entrant standing is the champion', () => {
  const state = buildPool(base({
    weeks: [
      { week: 1, locks_at: null, status: 'final' },
      { week: 2, locks_at: null, status: 'final' },
    ],
    picks: [
      pick('a', 1, 'DET'), pick('b', 1, 'GB'), pick('c', 1, 'KC'), pick('d', 1, 'BUF'),
      pick('b', 2, 'DAL'), pick('c', 2, 'MIA'), pick('d', 2, 'DAL'),
    ],
    results: [
      { week: 1, team: 'DET', outcome: 'win' },
      { week: 1, team: 'GB', outcome: 'loss' },
      { week: 1, team: 'KC', outcome: 'loss' },
      { week: 1, team: 'BUF', outcome: 'loss' },
      { week: 2, team: 'DAL', outcome: 'loss' },
      { week: 2, team: 'MIA', outcome: 'loss' },
    ],
  }))
  assert.equal(state.championName, 'Alice')
  assert.equal(state.standings[0].status, 'winner')
  assert.equal(state.aliveCount, 1)
  assert.equal(state.eliminatedCount, 3)
})

test('standings sort alive before eliminated, fewest strikes first', () => {
  const rows = buildPool(base()).standings.map((s) => s.name)
  assert.deepEqual(rows.slice(0, 2), ['Alice', 'Cara'], 'clean sheets lead, then by name')
  assert.equal(rows.at(-1), 'Dan')
})

test('a result entered before a week is final shows but does not strike', () => {
  const s = by(base({
    weeks: [{ week: 1, locks_at: null, status: 'locked' }],
    picks: [pick('a', 1, 'GB')],
    results: [{ week: 1, team: 'GB', outcome: 'loss' }],
  }))
  assert.equal(s.Alice.history[0].outcome, 'loss', 'the loss is visible')
  assert.equal(s.Alice.history[0].strike, false, 'but costs nothing until final')
  assert.equal(s.Alice.strikes, 0)
})

test('the current week is the open one', () => {
  assert.equal(buildPool(base()).currentWeek?.week, 4)
})

test('the pot scales with the entry fee and field size', () => {
  assert.equal(buildPool(base()).potLabel, '$80')
})

test('availableTeams hides teams the member already burned', () => {
  const state = buildPool(base())
  const cara = state.standings.find((s) => s.name === 'Cara')
  const open = availableTeams(teams, cara).map((t) => t.abbr)
  assert.ok(!open.includes('KC'))
  assert.ok(!open.includes('PHI'))
  assert.ok(open.includes('DET'))
  assert.equal(open.length, teams.length - 3)
})

test('the posted rules follow the settings', () => {
  const single = buildRules({ ...settings, strikes_to_eliminate: 1 }, 32)
  assert.ok(single.some((r) => r.title === 'One loss and you are out'))

  const double = buildRules(settings, 32)
  assert.ok(double.some((r) => r.title === 'Two strikes and you are out'))
  assert.ok(double.some((r) => r.body.includes('A tie counts as a survive')))
  assert.ok(double.some((r) => r.body.includes('No BYE weeks')))
  assert.ok(double.some((r) => r.body.includes('No buy-backs')))
  assert.ok(double.some((r) => r.body.includes('$20 to enter')))
})
