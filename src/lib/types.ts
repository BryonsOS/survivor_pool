export type WeekStatus = 'upcoming' | 'open' | 'locked' | 'final'
export type Outcome = 'win' | 'loss' | 'tie'
export type TieRule = 'survive' | 'loss'
export type MissedPickPolicy = 'strike' | 'record'

export interface Profile {
  id: string
  display_name: string
  is_admin: boolean
}

/** Shared with the fantasy-wrestling league: the member's real first name. */
export interface MemberDetail {
  user_id: string
  real_name: string | null
}

export interface PoolSettings {
  id: boolean
  pool_name: string
  season: number
  total_weeks: number
  strikes_to_eliminate: number
  tie_counts_as: TieRule
  bye_weeks_per_player: number
  allow_buy_backs: boolean
  buy_back_fee: number
  missed_pick_policy: MissedPickPolicy
  entry_fee: number
  pick_deadline_label: string
  payout_note: string
  payment_handle: string | null
  payment_url: string | null
  payment_instructions: string
  require_payment_to_pick: boolean
}

export interface Team {
  abbr: string
  name: string
  conference: string
  division: string
}

export interface Entrant {
  user_id: string
  joined_at: string
  /** Pool-only name. Falls back to the shared profile display name when unset. */
  team_name: string | null
  paid: boolean
  paid_at: string | null
  payment_note: string | null
}

export interface Week {
  week: number
  locks_at: string | null
  status: WeekStatus
}

export interface Game {
  id: string
  week: number
  away: string
  home: string
  neutral_site: boolean
  /** null when the league has not scheduled the kickoff yet (late-season flex). */
  kickoff_at: string | null
  tv: string | null
  note: string | null
}

export interface Result {
  week: number
  team: string
  outcome: Outcome
}

export interface PickRow {
  id: string
  user_id: string
  week: number
  team: string | null
  is_bye: boolean
}

export const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  upcoming: 'Upcoming',
  open: 'Picks open',
  locked: 'Locked',
  final: 'Final',
}

/** How a single week went for one entrant. */
export type PickOutcome =
  | 'win'
  | 'loss'
  | 'tie'
  | 'bye'
  | 'missed'
  | 'pending'
  | 'awaiting'
  | 'out'

export interface PickHistoryEntry {
  week: number
  team: string | null
  teamName: string | null
  outcome: PickOutcome
  label: string
  strike: boolean
}

export type EntrantStatus = 'alive' | 'eliminated' | 'winner'

export interface Standing {
  userId: string
  /** Team name if the player set one for this pool, otherwise their profile name. */
  name: string
  /** First name, shown beside the display name so the pool knows who is who. */
  realName: string | null
  status: EntrantStatus
  statusLabel: string
  strikes: number
  strikesToEliminate: number
  strikesRemaining: number
  eliminatedWeek: number | null
  teamsUsed: Team[]
  teamsRemaining: number
  byesUsed: number
  byesRemaining: number
  currentPick: string | null
  paid: boolean
  lastOutcomeLabel: string
  history: PickHistoryEntry[]
}
