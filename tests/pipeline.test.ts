import { expect, test } from 'claude-code/testing'

import { after, autoText, fileOf, gatesText, guessKind, guessSize, newPipeline, planBump, runId, stepPrompt, stepsFor } from '../src/pipeline'
import type { PipeRun } from '../types'

test('every size runs the steps in the plan\'s table, for every kind', () => {
  expect(stepsFor('tiny')).toEqual(['build', 'review', 'commit'])
  expect(stepsFor('small')).toEqual(['tests', 'build', 'review', 'commit'])
  expect(stepsFor('normal')).toEqual(['plan', 'tests', 'build', 'review', 'commit'])
  expect(stepsFor('big')).toEqual(['research', 'plan', 'tests', 'build', 'review', 'commit'])
  for (const kind of ['feature', 'fix', 'change', 'cleanup'] as const) {
    expect(newPipeline('x', 't', kind, 'normal', null).steps.map(s => s.id)).toEqual(['plan', 'tests', 'build', 'review', 'commit'])
  }
})

test('each step has its agent: architect plans Big, the owner\'s agent builds and commits', () => {
  const agents = (size: 'normal' | 'big') => newPipeline('x', 't', 'feature', size, 'fixer').steps.map(s => s.agent)
  expect(agents('normal')).toEqual(['planner', 'test-writer', 'fixer', 'reviewer', 'fixer'])
  expect(agents('big')).toEqual(['researcher', 'architect', 'test-writer', 'fixer', 'reviewer', 'fixer'])
  expect(newPipeline('x', 't', 'feature', 'tiny', null).steps[0]!.agent).toBeNull()
})

test('kind: each rule, in order, with its reason; Feature by default', () => {
  for (const word of ['fix', 'bug', 'broken', 'error', 'crash']) expect(guessKind(`The ${word} on save`).value).toBe('fix')
  for (const word of ['add', 'new', 'support']) expect(guessKind(`${word} dark mode`).value).toBe('feature')
  for (const text of ['Change the header', 'make it blue', 'Use tabs instead']) expect(guessKind(text).value).toBe('change')
  for (const word of ['clean', 'refactor', 'tidy', 'rename']) expect(guessKind(`${word} the parser`).value).toBe('cleanup')
  expect(guessKind('The export crashes on empty files')).toEqual({ value: 'fix', reason: 'says "crashes"' })
  // Fix is checked first, so a bug in a new thing is still a Fix.
  expect(guessKind('Fix the new button').value).toBe('fix')
  expect(guessKind('Dark mode for the dashboard')).toEqual({ value: 'feature' })
})

test('size: each rule with its reason; Small by default', () => {
  expect(guessSize('Fix the typo in the footer of the pricing page on mobile please')).toEqual({ value: 'tiny', reason: 'says "typo"' })
  for (const word of ['rename', 'copy', 'one line', 'one-line']) expect(guessSize(`${word} the label`).value).toBe('tiny')
  expect(guessSize('Add dark mode')).toEqual({ value: 'small', reason: 'short task' })
  expect(guessSize('Add a dark mode toggle to the settings page that remembers the choice across reloads')).toEqual({ value: 'small' })
  expect(guessSize('')).toEqual({ value: 'small' })
  for (const word of ['auth', 'login', 'security', 'secrets', 'API', 'migration', 'database', 'payments']) {
    expect(guessSize(`Touch the ${word} code`)).toEqual({ value: 'normal', reason: `mentions ${word.toLowerCase()}` })
  }
  expect(guessSize('Move code from a.ts to b.ts')).toEqual({ value: 'normal', reason: 'names 2 files' })
  for (const word of ['redesign', 'rewrite', 'new system']) expect(guessSize(`${word} the settings`).value).toBe('big')
  expect(guessSize('a.ts b.ts c.ts d.ts e.ts f.ts')).toEqual({ value: 'big', reason: 'names 6 files' })
})

test('security words beat Tiny: a rename in login code is Normal', () => {
  expect(guessSize('Rename the login token')).toEqual({ value: 'normal', reason: 'mentions login' })
  expect(guessSize('Fix the typo in a.ts and b.ts').value).toBe('normal')
})

test('the Auto line covers only the rows on Auto; a picked row overrides it', () => {
  expect(autoText('Fix the login crash', null, null)).toBe('Auto: Fix · Normal (says "fix", mentions login)')
  expect(autoText('Fix the login crash', null, 'big')).toBe('Auto: Fix (says "fix")')
  expect(autoText('Fix the login crash', 'change', null)).toBe('Auto: Normal (mentions login)')
  expect(autoText('Fix the login crash', 'change', 'big')).toBeUndefined()
  expect(autoText('Dark mode for the dashboard and every settings screen we ship today', null, null)).toBe('Auto: Feature · Small')
})

test('after Plan, a Normal plan naming 6+ files is bumped to Big', () => {
  const plan = 'Edit a.ts, b.ts, c.ts, d.ts, e.ts and f.tsx; check a.ts again.'
  expect(planBump('normal', plan)).toEqual({ size: 'big', note: 'Size bumped to Big: the plan names 6 files.' })
  expect(planBump('normal', 'Edit a.ts and b.ts')).toBeUndefined()
  expect(planBump('big', plan)).toBeUndefined()
})

test('Fix starts with a failing test; Clean up keeps the tests green', () => {
  const fix = newPipeline('r1', 'Fix the crash', 'fix', 'small', null)
  expect(stepPrompt(fix, 0)).toContain('Write a failing test that reproduces the bug')
  const clean = newPipeline('r1', 'Tidy up', 'cleanup', 'tiny', null)
  expect(stepPrompt(clean, 0)).toContain('They must stay green')
  expect(gatesText('normal')).toBe('Plan → Tests → Build → Review → Commit · stops for your OK after Plan, before Commit')
  expect(gatesText('tiny')).toBe('Build → Review → Commit · stops for your OK before Commit')
})

const running = (run: PipeRun, i: number): PipeRun => ({ ...run, steps: run.steps.map((s, j) => (j === i ? { ...s, status: 'running' } : j < i ? { ...s, status: 'done' } : s)) })

test('a Normal run stops after Plan and before Commit, and goes on otherwise', () => {
  const run = newPipeline('r1', 't', 'feature', 'normal', null)
  const plan = after(running(run, 0), { kind: 'done', answer: 'plan' })
  expect(plan.next).toBeNull()
  expect(plan.run.steps[0]!.status).toBe('gate')

  const ok = after(plan.run, { kind: 'approve' })
  expect(ok.next).toBe(1)
  expect(ok.run.steps[0]!.status).toBe('done')

  expect(after(running(run, 1), { kind: 'done', answer: 'tests' }).next).toBe(2)
  expect(after(running(run, 3), { kind: 'done', answer: 'review' }).run.steps[3]!.status).toBe('gate')
  const last = after(running(run, 4), { kind: 'done', answer: 'committed' })
  expect(last.next).toBeNull()
  expect(last.run.ended).toBe('done')
})

test('Change re-runs the same step with the note; Stop and failures end the run', () => {
  const run = newPipeline('r1', 't', 'feature', 'normal', null)
  const gated = after(running(run, 0), { kind: 'done', answer: 'plan' }).run
  const changed = after(gated, { kind: 'change', note: 'smaller slices' })
  expect(changed.next).toBe(0)
  expect(changed.run.note).toBe('smaller slices')
  expect(stepPrompt(changed.run, 0)).toContain('The owner asked for a change: smaller slices')

  expect(after(gated, { kind: 'stop' }).run.ended).toBe('stopped')
  const failed = after(running(run, 1), { kind: 'failed', error: 'boom' })
  expect(failed.run.ended).toBe('failed')
  expect(failed.run.steps[1]!.error).toBe('boom')
  expect(failed.next).toBeNull()
})

test('later steps name the earlier result files', () => {
  const run = running(newPipeline('20261029-101112', 't', 'feature', 'normal', null), 2)
  expect(fileOf(run, 0)).toBe('.deckhand/pipeline/20261029-101112/01-plan.md')
  expect(stepPrompt(run, 2)).toContain('- .deckhand/pipeline/20261029-101112/02-tests.md')
  expect(runId(Date.UTC(2026, 9, 29, 10, 11, 12))).toBe('20261029-101112')
})
