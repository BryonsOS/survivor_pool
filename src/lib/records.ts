/**
 * Season win/loss records, computed from survivor_results.
 *
 * The scores feed records both teams of every finished game, not just the ones
 * somebody picked, so the results table doubles as a standings table. No API
 * call, no extra job — and this season only, since nothing is recorded before
 * Week 1.
 */
import type { Result } from './types'

export interface TeamRecord {
  wins: number
  losses: number
  ties: number
}

export function teamRecords(results: Result[]): Map<string, TeamRecord> {
  const map = new Map<string, TeamRecord>()
  for (const result of results) {
    const record = map.get(result.team) ?? { wins: 0, losses: 0, ties: 0 }
    if (result.outcome === 'win') record.wins++
    else if (result.outcome === 'loss') record.losses++
    else record.ties++
    map.set(result.team, record)
  }
  return map
}

/** "3-1", or "3-1-1" once a tie is on the books — the way the league prints it. */
export function formatRecord(record: TeamRecord | undefined): string {
  if (!record) return ''
  const base = `${record.wins}-${record.losses}`
  return record.ties ? `${base}-${record.ties}` : base
}
