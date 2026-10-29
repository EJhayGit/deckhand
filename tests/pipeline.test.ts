import { expect, test } from 'claude-code/testing'

import { after, fileOf, gatesText, newPipeline, runId, stepPrompt, stepsFor, suggestKind, suggestSize } from '../src/pipeline'
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

test('size: short tasks are tiny, long ones grow, security or API words make it at least Normal', () => {
  expect(suggestSize('Fix the typo in the footer')).toBe('tiny')
  expect(suggestSize('Rename the button label on the settings page so it reads Save instead of Apply, and update its test in settings.test.ts too')).toBe('small')
  expect(suggestSize('Fix the login redirect')).toBe('normal')
  expect(suggestSize('Add a field to the public API')).toBe('normal')
  expect(suggestSize('Migrate the store')).toBe('normal')
  expect(suggestSize('word '.repeat(200))).toBe('big')
  expect(suggestSize('a.ts b.ts c.ts d.ts e.ts f.ts g.ts h.ts i.ts j.ts')).toBe('big')
})

test('kind: bug words mean Fix, clean-up words Clean up, change words Change, else Feature', () => {
  expect(suggestKind('The export crashes on empty files')).toBe('fix')
  expect(suggestKind('Refactor the parser')).toBe('cleanup')
  expect(suggestKind('Rename the config key')).toBe('change')
  expect(suggestKind('Add dark mode')).toBe('feature')
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
