/**
 * Turning betting odds into a win percentage.
 *
 * Sportsbooks quote American moneylines, and the two sides of a game always imply
 * more than 100% between them — the difference is the book's margin, the "vig".
 * Reporting a raw implied probability would overstate both teams' chances, so the
 * pair is normalised back to 100%.
 */

/** Raw implied probability of an American moneyline, vig included. */
export function impliedProbability(moneyline: number): number {
  if (!Number.isFinite(moneyline) || moneyline === 0) return 0
  return moneyline > 0 ? 100 / (moneyline + 100) : -moneyline / (-moneyline + 100)
}

export interface WinChances {
  home: number
  away: number
}

/**
 * De-vigged win chances for a game, as fractions summing to 1.
 * Returns null when either side is missing, so the UI can simply show nothing.
 */
export function winChances(
  homeMoneyline: number | null | undefined,
  awayMoneyline: number | null | undefined,
): WinChances | null {
  if (homeMoneyline == null || awayMoneyline == null) return null
  const home = impliedProbability(homeMoneyline)
  const away = impliedProbability(awayMoneyline)
  const total = home + away
  if (total <= 0) return null
  return { home: home / total, away: away / total }
}

/** The chance for one side of a game, or null when odds are not in yet. */
export function teamWinChance(
  team: string,
  game: { home: string; away: string; home_moneyline: number | null; away_moneyline: number | null },
): number | null {
  const chances = winChances(game.home_moneyline, game.away_moneyline)
  if (!chances) return null
  if (team === game.home) return chances.home
  if (team === game.away) return chances.away
  return null
}

export function formatChance(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/** Odds older than this are stale enough to stop showing. */
const MAX_AGE_HOURS = 36

export function oddsAreFresh(updatedAt: string | null | undefined, now = Date.now()): boolean {
  if (!updatedAt) return false
  const ts = new Date(updatedAt).getTime()
  if (Number.isNaN(ts)) return false
  return now - ts < MAX_AGE_HOURS * 60 * 60 * 1000
}
