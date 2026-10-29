import { expect, test } from 'claude-code/testing'

import { badges } from '../src/limits'
import { cardStatus } from '../src/ui/status'

test('cardStatus: in use, running N, or ready, each a glyph plus a word', () => {
  const use = cardStatus(true, 0)
  const run = cardStatus(false, 2)
  const idle = cardStatus(false, 0)

  expect(`${use.glyph} ${use.word}`).toBe('● in use')
  expect(`${run.glyph} ${run.word}`).toBe('▶ running 2')
  expect(`${idle.glyph} ${idle.word}`).toBe('○ ready')
  expect(new Set([use.color, run.color, idle.color]).size).toBe(3)
})

test('cardStatus: running outranks in use only when something runs', () => {
  expect(cardStatus(true, 1).word).toBe('running 1')
  expect(cardStatus(true, 0).word).toBe('in use')
})

test('badges: short words for what an agent may do', () => {
  expect(badges({ edit: false, run: false, internet: false })).toEqual(['read only'])
  expect(badges({ edit: true, run: true, internet: false })).toEqual(['edit', 'run'])
  expect(badges({ edit: false, run: false, internet: true })).toEqual(['web'])
})
