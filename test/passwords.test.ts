import test from 'node:test'
import assert from 'node:assert/strict'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../src/lib/passwords.ts'

test('a password meeting every rule is accepted', () => {
  assert.equal(passwordProblem('Survivor2026'), null)
})

test('length is reported as how many more characters are needed', () => {
  assert.equal(passwordProblem('Ab1'), '7 more characters needed.')
  assert.equal(passwordProblem('Abcdefgh1'), '1 more character needed.')
})

test('length is checked before composition, so the message is one thing at a time', () => {
  // short AND missing a digit — the reader is told to keep typing first
  assert.match(passwordProblem('abc') ?? '', /more characters/)
})

test('missing character classes are listed in plain english', () => {
  assert.equal(passwordProblem('lowercaseonly'), 'Add an uppercase letter and a number.')
  assert.equal(passwordProblem('lowercase1234'), 'Add an uppercase letter.')
  assert.equal(passwordProblem('LOWERCASE1234'), 'Add a lowercase letter.')
  assert.equal(passwordProblem('LowercaseOnly'), 'Add a number.')
})

test('the minimum matches what the Supabase dashboard is set to', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 10)
})
