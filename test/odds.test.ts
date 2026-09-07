import test from 'node:test'
import assert from 'node:assert/strict'
import {
  impliedProbability,
  winChances,
  teamWinChance,
  formatChance,
  oddsAreFresh,
} from '../src/lib/odds.ts'

const near = (actual: number, expected: number, tol = 0.001) =>
  assert.ok(Math.abs(actual - expected) < tol, `${actual} ≈ ${expected}`)

test('favourites and underdogs convert correctly', () => {
  near(impliedProbability(-200), 0.6667)  // lay 200 to win 100
  near(impliedProbability(+150), 0.4)     // bet 100 to win 150
  near(impliedProbability(-110), 0.5238)  // the standard juiced coin flip
  near(impliedProbability(+100), 0.5)     // even money
})

test('the vig is removed so the two sides total 100%', () => {
  // -110/-110 implies 104.8% between them; a pick-em must come back to 50/50
  const even = winChances(-110, -110)!
  near(even.home, 0.5)
  near(even.away, 0.5)
  near(even.home + even.away, 1)

  const lopsided = winChances(-200, +170)!
  near(lopsided.home + lopsided.away, 1)
  assert.ok(lopsided.home > lopsided.away, 'the favourite leads')
  near(lopsided.home, 0.6432)
})

test('a heavy favourite still reads sensibly', () => {
  const blowout = winChances(-1000, +650)!
  near(blowout.home + blowout.away, 1)
  assert.ok(blowout.home > 0.85 && blowout.home < 0.95, `got ${blowout.home}`)
})

test('missing odds yield nothing rather than a fake number', () => {
  assert.equal(winChances(null, -110), null)
  assert.equal(winChances(-110, null), null)
  assert.equal(winChances(null, null), null)
  assert.equal(winChances(undefined, undefined), null)
})

test('the chance is read from the right side of the game', () => {
  const game = { home: 'PHI', away: 'PIT', home_moneyline: -200, away_moneyline: +170 }
  near(teamWinChance('PHI', game)!, 0.6432)
  near(teamWinChance('PIT', game)!, 0.3568)
  assert.equal(teamWinChance('KC', game), null, 'a team not in this game has no chance here')
})

test('a game with no odds reports no chance', () => {
  const game = { home: 'PHI', away: 'PIT', home_moneyline: null, away_moneyline: null }
  assert.equal(teamWinChance('PHI', game), null)
})

test('chances render as whole percentages', () => {
  assert.equal(formatChance(0.6432), '64%')
  assert.equal(formatChance(0.5), '50%')
  assert.equal(formatChance(0.999), '100%')
})

test('stale odds are not treated as current', () => {
  const now = Date.parse('2026-09-10T12:00:00Z')
  assert.equal(oddsAreFresh('2026-09-10T06:00:00Z', now), true, 'six hours old is fine')
  assert.equal(oddsAreFresh('2026-09-08T12:00:00Z', now), false, 'two days old is stale')
  assert.equal(oddsAreFresh(null, now), false)
  assert.equal(oddsAreFresh('not a date', now), false)
})
