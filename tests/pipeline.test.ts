import { expect, test } from 'claude-code/testing'

import { limitsFor } from '../src/limits'
import { after, agentFor, autoText, blockedIn, chatPrompt, fileOf, fixesOf, gatesText, guessKind, guessSize, newPipeline, planBump, preflight, roundTotals, runId, shortfallText, stepPrompt, stepsFor, typeOf, withAgent } from '../src/pipeline'
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

const running = (run: PipeRun, i: number): PipeRun => ({ ...run, steps: run.steps.map((s, j) => (j === i ? { ...s, status: 'running' } : j < i ? { ...s, status: 'done' } : s)) })

const READ = { edit: false, run: false, internet: false }
const BUILD = { edit: true, run: true, internet: false }
const DECK = { researcher: { ...READ, internet: true }, planner: READ, architect: READ, 'test-writer': BUILD, reviewer: READ, fixer: BUILD, 'bug-fixer': BUILD, builder: BUILD, committer: { ...READ, run: true } }

test('each step has its default agent: architect plans Big, the builder builds, the committer commits', () => {
  const agents = (size: 'normal' | 'big') => newPipeline('x', 't', 'feature', size, 'fixer', DECK).steps.map(s => s.agent)
  expect(agents('normal')).toEqual(['planner', 'test-writer', 'builder', 'reviewer', 'committer'])
  expect(agents('big')).toEqual(['researcher', 'architect', 'test-writer', 'builder', 'reviewer', 'committer'])
  expect(newPipeline('x', 't', 'feature', 'tiny', null).steps[0]!.agent).toBeNull()
  expect(agentFor('commit', 'small', 'feature', { builder: BUILD })).toEqual({ agent: null, note: 'No committer agent installed: plain Claude Code commits.' })
})

test('Build never takes the agent in use: the builder, the bug-fixer for a Fix, else plain Claude Code', () => {
  expect(newPipeline('x', 't', 'feature', 'small', 'fixer', DECK).steps[1]!.agent).toBe('builder')
  expect(agentFor('build', 'small', 'feature', DECK)).toEqual({ agent: 'builder' })
  expect(agentFor('build', 'small', 'fix', DECK)).toEqual({ agent: 'bug-fixer' })
  expect(agentFor('build', 'small', 'fix', { builder: BUILD })).toEqual({ agent: 'builder' })
  expect(agentFor('build', 'small', 'feature', { researcher: DECK.researcher, fixer: BUILD })).toEqual({ agent: null, note: 'No builder agent installed: plain Claude Code builds.' })
  // A bug fixer is not a builder outside a Fix: its instructions say no features.
  expect(agentFor('build', 'small', 'feature', { researcher: DECK.researcher, 'bug-fixer': BUILD })).toEqual({ agent: null, note: 'No builder agent installed: plain Claude Code builds.' })
})

test('a missing default agent falls back to plain Claude Code and says so', () => {
  const { 'test-writer': _, ...deck } = DECK
  const tests = newPipeline('x', 't', 'feature', 'small', null, deck).steps[0]!
  expect(tests).toEqual({ id: 'tests', agent: null, status: 'waiting', note: 'No test-writer agent installed: plain Claude Code runs this step.' })
})

test('an override picks a step agent for this run; withAgent changes a waiting step only', () => {
  const run = newPipeline('x', 't', 'feature', 'normal', null, DECK, { tests: 'fixer', plan: null })
  expect(run.steps.map(s => s.agent)).toEqual([null, 'fixer', 'builder', 'reviewer', 'committer'])
  const done = { ...run, steps: run.steps.map((s, i) => (i === 0 ? { ...s, status: 'done' as const } : s)) }
  expect(withAgent(done, 'plan', 'architect').steps[0]!.agent).toBeNull()
  expect(withAgent(done, 'tests', 'test-writer').steps[1]!.agent).toBe('test-writer')
})

test('preflight: a read-only Tests agent stops Start; plain Claude Code and fit agents pass', () => {
  const run = newPipeline('x', 't', 'feature', 'normal', null, DECK, { tests: 'researcher' })
  const short = preflight(run.steps, DECK)
  expect(short).toEqual([{ step: 'tests', agent: 'researcher', missing: ['edit', 'run'] }])
  expect(shortfallText(short[0]!)).toBe('Tests: researcher is missing Edit files, Run commands.')
  expect(preflight(newPipeline('x', 't', 'feature', 'big', 'planner', DECK).steps, DECK)).toEqual([])
  expect(preflight(withAgent(run, 'tests', null).steps, DECK)).toEqual([])
})

test('each step spawns its deck agent\'s type; plain Claude Code is general-purpose', () => {
  const cards = [{ name: 'test-writer', agentType: 'deckhand:test-writer' }, { name: 'mine', agentType: 'mine' }]
  expect(typeOf('test-writer', cards)).toBe('deckhand:test-writer')
  expect(typeOf('mine', cards)).toBe('mine')
  expect(typeOf('planner', cards)).toBe('deckhand:planner')
  expect(typeOf(null, cards)).toBe('general-purpose')
  const sent = chatPrompt('deckhand:test-writer', 'Write the tests.')
  expect(sent).toContain('subagent_type `deckhand:test-writer`')
  expect(sent).toMatch(/not in\s+the background/)
  expect(sent).toMatch(/reply\s+only: Done\./)
  expect(sent.endsWith('Write the tests.')).toBe(true)
})

test('preflight: an agent on a Local or Codex model can\'t run as a subagent', () => {
  const run = newPipeline('x', 't', 'feature', 'small', null, { ...DECK, local: BUILD }, { build: 'local' })
  const short = preflight(run.steps, { ...DECK, local: BUILD }, ['local'])
  expect(short).toEqual([{ step: 'build', agent: 'local', missing: [], reason: 'runs on a Local or Codex model and can\'t run as a subagent.' }])
  expect(shortfallText(short[0]!)).toBe('Build: local runs on a Local or Codex model and can\'t run as a subagent.')
})

test('a loop keeps its own limits, else the agent in use\'s', () => {
  const own = { name: 'test-writer', limits: BUILD }
  const active = { name: 'researcher', limits: READ }
  expect(limitsFor(own, active)).toBe(own)
  expect(limitsFor(undefined, active)).toBe(active)
  expect(limitsFor(undefined, undefined)).toBeUndefined()
})

test('blocked: a needed permission stops the step until Retry; a stray edit in a read-only step does not', () => {
  const note = 'Blocked: researcher tried to edit `a.ts`, but Edit files is off for this agent.'
  expect(blockedIn(`I couldn't.\n${note}`, 'tests')).toBe(note)
  expect(blockedIn(note, 'plan')).toBeUndefined()
  expect(blockedIn('All done.', 'build')).toBeUndefined()

  const run = running(newPipeline('r1', 't', 'feature', 'small', null, DECK), 0)
  const blocked = after(run, { kind: 'blocked', reason: note })
  expect(blocked.next).toBeNull()
  expect(blocked.run.ended).toBeUndefined()
  expect(blocked.run.steps[0]).toMatchObject({ status: 'blocked', error: note })
  const retried = after(blocked.run, { kind: 'retry' })
  expect(retried.next).toBe(0)
  expect(retried.run.steps[0]!.status).toBe('waiting')
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

test('a fix event at the Review gate sends Build back as the next round; anywhere else it does nothing', () => {
  const run = newPipeline('20261029-100000', 't', 'feature', 'small', null, DECK)
  const gate = { ...run, cap: 3, steps: run.steps.map((s, i) => (i < 2 ? { ...s, status: 'done' as const } : i === 2 ? { ...s, status: 'gate' as const } : s)) }
  const prev = [{ id: 1, severity: 'medium' as const, file: 'a', line: 1, title: 't', evidence: 'e', reviewers: ['r'], verdict: 'advice' as const }]
  const fixed = after({ ...gate, brake: 'old' }, { kind: 'fix', previous: prev, base: 'abc' })
  expect(fixed.next).toBe(1)
  expect(fixed.run.steps.map(s => s.status)).toEqual(['done', 'waiting', 'waiting', 'waiting'])
  expect(fixed.run).toMatchObject({ round: 1, previous: prev, base: 'abc', brake: undefined })
  expect(after(fixed.run, { kind: 'fix', previous: [] }).next).toBeNull()
  expect(stepPrompt(fixed.run, 1)).toContain('Fix round 1/3. Read .deckhand/pipeline/20261029-100000/02-fixes.md')
  expect(fixesOf(run)).toBe('.deckhand/pipeline/20261029-100000/02-fixes.md')
})

test('round totals add up each round\'s Runs rows for one step, from this run only', () => {
  const since = Date.UTC(2026, 9, 29, 10, 0, 0)
  const rows = [
    { title: 'Round 1/3 · Build', tokens: 100, cost: 0.1, startedAt: since + 5 },
    { title: 'Round 1/3 · Review (reviewer)', tokens: 50, cost: 0.05, startedAt: since + 6 },
    { title: 'Round 2/3 · Build', tokens: 30, cost: 0.03, startedAt: since + 7 },
    { title: 'Round 2/3 · Build', tokens: 999, cost: 9, startedAt: since - 1000 },
  ]
  expect(roundTotals(rows, { id: '20261029-100000', round: 2 }, 'build')).toEqual([{ round: 1, tokens: 100, cost: 0.1 }, { round: 2, tokens: 30, cost: 0.03 }])
  expect(roundTotals(rows, { id: '20261029-100000', round: 2 }, 'review')).toEqual([{ round: 1, tokens: 50, cost: 0.05 }, { round: 2, tokens: 0, cost: 0 }])
  expect(roundTotals(rows, { id: '20261029-100000' }, 'build')).toEqual([])
})
