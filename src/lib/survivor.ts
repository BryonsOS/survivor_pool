import type {
  Entrant,
  PickHistoryEntry,
  PickRow,
  PoolSettings,
  Profile,
  Result,
  Standing,
  Team,
  Week,
} from './types'

/**
 * The scoring engine. Walks the season week by week for each entrant and derives
 * strikes, eliminations, burned teams, and the champion.
 *
 * Only weeks marked `final` are graded — a week that is open or locked is shown
 * but never costs anyone a strike. Teams are burned on any real pick, win or lose.
 */

export interface PoolInput {
  settings: PoolSettings
  teams: Team[]
  weeks: Week[]
  results: Result[]
  entrants: Entrant[]
  profiles: Profile[]
  picks: PickRow[]
}

export interface PoolState {
  standings: Standing[]
  aliveCount: number
  eliminatedCount: number
  championName: string | null
  currentWeek: Week | null
  weeksGraded: number
  potLabel: string
  formatLabel: string
}

interface Ledger {
  userId: string
  name: string
  strikes: number
  eliminated: boolean
  eliminatedWeek: number | null
  teamsUsed: string[]
  byesUsed: number
  history: PickHistoryEntry[]
}

export function buildPool(input: PoolInput): PoolState {
  const { settings, teams, weeks, results, entrants, profiles, picks } = input

  const teamByAbbr = new Map(teams.map((team) => [team.abbr, team]))
  const nameById = new Map(profiles.map((profile) => [profile.id, profile.display_name]))

  // results indexed as week -> team -> outcome
  const resultsByWeek = new Map<number, Map<string, Result['outcome']>>()
  for (const row of results) {
    let bucket = resultsByWeek.get(row.week)
    if (!bucket) {
      bucket = new Map()
      resultsByWeek.set(row.week, bucket)
    }
    bucket.set(row.team, row.outcome)
  }

  // picks indexed as week -> userId -> pick
  const picksByWeek = new Map<number, Map<string, PickRow>>()
  for (const pick of picks) {
    let bucket = picksByWeek.get(pick.week)
    if (!bucket) {
      bucket = new Map()
      picksByWeek.set(pick.week, bucket)
    }
    bucket.set(pick.user_id, pick)
  }

  const orderedWeeks = [...weeks].sort((a, b) => a.week - b.week)
  const ledgers = new Map<string, Ledger>(
    entrants.map((entrant) => [
      entrant.user_id,
      {
        userId: entrant.user_id,
        name: nameById.get(entrant.user_id) ?? 'Unknown member',
        strikes: 0,
        eliminated: false,
        eliminatedWeek: null,
        teamsUsed: [],
        byesUsed: 0,
        history: [],
      },
    ]),
  )

  for (const week of orderedWeeks) {
    const weekPicks = picksByWeek.get(week.week)
    const weekResults = resultsByWeek.get(week.week)

    for (const ledger of ledgers.values()) {
      const pick = weekPicks?.get(ledger.userId) ?? null
      const entry = gradePick(ledger, week, pick, weekResults, settings, teamByAbbr)
      ledger.history.push(entry)

      if (entry.outcome === 'bye') ledger.byesUsed += 1
      if (entry.team && burnsTeam(entry.outcome) && !ledger.teamsUsed.includes(entry.team)) {
        ledger.teamsUsed.push(entry.team)
      }
      if (entry.strike) ledger.strikes += 1

      if (!ledger.eliminated && ledger.strikes >= settings.strikes_to_eliminate) {
        ledger.eliminated = true
        ledger.eliminatedWeek = week.week
      }
    }
  }

  const currentWeek =
    orderedWeeks.find((week) => week.status === 'open') ??
    orderedWeeks.find((week) => week.status === 'locked') ??
    orderedWeeks.find((week) => week.status !== 'final') ??
    orderedWeeks.at(-1) ??
    null

  const standings: Standing[] = [...ledgers.values()].map((ledger) =>
    finalize(ledger, settings, teams.length, teamByAbbr, currentWeek),
  )

  const weeksGraded = orderedWeeks.filter((week) => week.status === 'final').length
  const alive = standings.filter((row) => row.status === 'alive')
  const champion = weeksGraded > 0 && alive.length === 1 ? alive[0] : null
  if (champion) {
    champion.status = 'winner'
    champion.statusLabel = 'Last player standing'
  }

  sortStandings(standings)

  return {
    standings,
    aliveCount: alive.length,
    eliminatedCount: standings.length - alive.length,
    championName: champion ? champion.name : null,
    currentWeek,
    weeksGraded,
    potLabel: formatMoney(settings.entry_fee * standings.length),
    formatLabel:
      settings.strikes_to_eliminate > 1
        ? `Double elimination · ${settings.strikes_to_eliminate} strikes`
        : 'Single elimination',
  }
}

function burnsTeam(outcome: PickHistoryEntry['outcome']) {
  return outcome === 'win' || outcome === 'loss' || outcome === 'tie' || outcome === 'pending'
}

function gradePick(
  ledger: Ledger,
  week: Week,
  pick: PickRow | null,
  weekResults: Map<string, Result['outcome']> | undefined,
  settings: PoolSettings,
  teamByAbbr: Map<string, Team>,
): PickHistoryEntry {
  const base: PickHistoryEntry = {
    week: week.week,
    team: pick?.team ?? null,
    teamName: pick?.team ? (teamByAbbr.get(pick.team)?.name ?? pick.team) : null,
    outcome: 'awaiting',
    label: 'No pick yet',
    strike: false,
  }

  if (ledger.eliminated) {
    return { ...base, team: null, teamName: null, outcome: 'out', label: 'Out' }
  }

  if (pick?.is_bye) {
    const byesLeft = settings.bye_weeks_per_player - ledger.byesUsed
    if (byesLeft > 0) {
      return { ...base, outcome: 'bye', label: 'BYE week used' }
    }
    return {
      ...base,
      outcome: 'missed',
      label: 'No BYE left · strike',
      strike: week.status === 'final',
    }
  }

  if (!pick || !pick.team) {
    if (week.status !== 'final') return base
    return {
      ...base,
      outcome: 'missed',
      label: settings.missed_pick_policy === 'strike' ? 'Missed pick · strike' : 'Missed pick',
      strike: settings.missed_pick_policy === 'strike',
    }
  }

  const teamName = base.teamName ?? pick.team
  const outcome = weekResults?.get(pick.team)

  if (!outcome) {
    return { ...base, outcome: 'pending', label: `${teamName} · awaiting result` }
  }

  // Results are visible as soon as the commissioner enters them, but nothing
  // costs a strike until the week is marked final. That keeps "final" as the
  // deliberate sign-off rather than something scoring races ahead of.
  const graded = week.status === 'final'

  if (outcome === 'win') {
    return { ...base, outcome: 'win', label: `${teamName} won` }
  }

  if (outcome === 'tie') {
    const isLoss = settings.tie_counts_as === 'loss'
    return {
      ...base,
      outcome: 'tie',
      label: `${teamName} tied · ${isLoss ? 'strike' : 'survived'}`,
      strike: isLoss && graded,
    }
  }

  return {
    ...base,
    outcome: 'loss',
    label: graded ? `${teamName} lost · strike` : `${teamName} lost`,
    strike: graded,
  }
}

function finalize(
  ledger: Ledger,
  settings: PoolSettings,
  teamCount: number,
  teamByAbbr: Map<string, Team>,
  currentWeek: Week | null,
): Standing {
  const current = currentWeek
    ? ledger.history.find((entry) => entry.week === currentWeek.week)
    : undefined
  const lastGraded = [...ledger.history]
    .reverse()
    .find((entry) => ['win', 'loss', 'tie', 'bye', 'missed'].includes(entry.outcome))

  return {
    userId: ledger.userId,
    name: ledger.name,
    status: ledger.eliminated ? 'eliminated' : 'alive',
    statusLabel: statusLabel(ledger, settings),
    strikes: ledger.strikes,
    strikesToEliminate: settings.strikes_to_eliminate,
    strikesRemaining: Math.max(0, settings.strikes_to_eliminate - ledger.strikes),
    eliminatedWeek: ledger.eliminatedWeek,
    teamsUsed: ledger.teamsUsed.map(
      (abbr) =>
        teamByAbbr.get(abbr) ?? { abbr, name: abbr, conference: '', division: '' },
    ),
    teamsRemaining: Math.max(0, teamCount - ledger.teamsUsed.length),
    byesUsed: ledger.byesUsed,
    byesRemaining: Math.max(0, settings.bye_weeks_per_player - ledger.byesUsed),
    currentPick: current?.team ?? null,
    lastOutcomeLabel: lastGraded
      ? `Week ${lastGraded.week} · ${lastGraded.label}`
      : 'No graded week yet.',
    history: ledger.history.filter((entry) => entry.outcome !== 'awaiting' || entry.week === currentWeek?.week),
  }
}

function statusLabel(ledger: Ledger, settings: PoolSettings) {
  if (ledger.eliminated) return `Eliminated · Week ${ledger.eliminatedWeek}`
  if (ledger.strikes === 0) return 'Alive · clean sheet'
  const left = settings.strikes_to_eliminate - ledger.strikes
  return `Alive · ${ledger.strikes} strike${ledger.strikes === 1 ? '' : 's'} · ${left} to spare`
}

function sortStandings(rows: Standing[]) {
  const rank: Record<Standing['status'], number> = { winner: 0, alive: 1, eliminated: 2 }
  rows.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    if (a.status === 'eliminated') {
      return (b.eliminatedWeek ?? 0) - (a.eliminatedWeek ?? 0) || a.name.localeCompare(b.name)
    }
    // Everyone still alive has played the same weeks, so teams-remaining only
    // reflects the in-progress pick — strikes then name is the honest order.
    if (a.strikes !== b.strikes) return a.strikes - b.strikes
    return a.name.localeCompare(b.name)
  })
}

/** Teams a member may still pick: never used, and not already taken this week. */
export function availableTeams(teams: Team[], standing: Standing | undefined): Team[] {
  if (!standing) return teams
  const used = new Set(standing.teamsUsed.map((team) => team.abbr))
  return teams.filter((team) => !used.has(team.abbr))
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)
}

export function buildRules(settings: PoolSettings, teamCount: number) {
  return [
    {
      title: 'One pick a week',
      body: `Pick a single NFL team to win each week. Picks lock at ${settings.pick_deadline_label}. Win and you advance.`,
    },
    {
      title: 'Teams are one-time use',
      body: `Once you pick a team it is gone for the rest of the season. All ${teamCount} teams are available to start, and every pick you make — win or lose — burns that team.`,
    },
    {
      title:
        settings.strikes_to_eliminate > 1
          ? 'Two strikes and you are out'
          : 'One loss and you are out',
      body:
        settings.strikes_to_eliminate > 1
          ? `A loss is a strike, not an exit. You survive your first strike and are eliminated on strike ${settings.strikes_to_eliminate}.`
          : 'A single loss eliminates you immediately. Last player standing takes the pot.',
    },
    {
      title: 'Ties',
      body:
        settings.tie_counts_as === 'loss'
          ? 'A tie counts as a loss and costs you a strike. The team is still burned.'
          : 'A tie counts as a survive — no strike. The team is still burned.',
    },
    {
      title: 'Missed picks',
      body:
        settings.missed_pick_policy === 'strike'
          ? 'No pick in by the deadline is a strike. Get your pick in even if you are unsure.'
          : 'A missed pick is recorded but does not cost a strike.',
    },
    {
      title: 'BYE weeks',
      body:
        settings.bye_weeks_per_player > 0
          ? `Each player gets ${settings.bye_weeks_per_player} BYE week${settings.bye_weeks_per_player === 1 ? '' : 's'}. A BYE skips the week without a strike and without burning a team.`
          : 'No BYE weeks. Every week needs a pick.',
    },
    {
      title: 'Buy-backs',
      body: settings.allow_buy_backs
        ? `Eliminated players may buy back in for ${formatMoney(settings.buy_back_fee)}. Bought-back entries return with a clean slate but are capped at the second-place bracket.`
        : 'No buy-backs. Once you are out, you are out.',
    },
    {
      title: 'Entry and payout',
      body: `${formatMoney(settings.entry_fee)} to enter. ${settings.payout_note}`,
    },
  ]
}
