import test from 'node:test'
import assert from 'node:assert/strict'
import { formatRecord, teamRecords } from '../src/lib/records.ts'
import type { Result } from '../src/lib/types.ts'

const results: Result[] = [
  { week: 1, team: 'DET', outcome: 'win' },
  { week: 1, team: 'GB', outcome: 'loss' },
  { week: 2, team: 'DET', outcome: 'win' },
  { week: 2, team: 'GB', outcome: 'win' },
  { week: 3, team: 'DET', outcome: 'loss' },
  { week: 3, team: 'GB', outcome: 'tie' },
]

test('records count every outcome per team across weeks', () => {
  const records = teamRecords(results)
  assert.deepEqual(records.get('DET'), { wins: 2, losses: 1, ties: 0 })
  assert.deepEqual(records.get('GB'), { wins: 1, losses: 1, ties: 1 })
})

test('a team with no results yet has no record rather than 0-0', () => {
  assert.equal(teamRecords(results).get('KC'), undefined)
  assert.equal(formatRecord(undefined), '')
})

test('ties only appear in the record once there is one', () => {
  const records = teamRecords(results)
  assert.equal(formatRecord(records.get('DET')), '2-1')
  assert.equal(formatRecord(records.get('GB')), '1-1-1')
})
