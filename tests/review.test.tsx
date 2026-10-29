import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PANE, START, agentEnds, playChat, world } from './world'
import type { World } from './world'

const DIFF = 'diff --git a/src/run.ts b/src/run.ts\n+export const run = (cmd: string) => exec(cmd)\n'
const finding = (o: Record<string, unknown>) => JSON.stringify({ severity: 'high', file: 'src/run.ts', line: 1, title: 'Shell injection', evidence: 'exec(cmd)', reviewer: 'reviewer', ...o })

// The agent the chat started as number `n` (1-based) ends with `text`.
function ends($: Engine, w: World, clock: { advance: (ms: number) => Promise<void> }, n: number, text: string) {
  return agentEnds($, w, clock, text, 'answer', n)
}

// A Tiny run (Build, Review, Commit) with Build's subagent already over.
async function toReview($: Engine, w: World, clock: { advance: (ms: number) => Promise<void> }, rounds?: number) {
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Tidy the runner' })
  await ui.press({ key: 'size-tiny' })
  if (rounds) await ui.press({ key: `rounds-${rounds}` })
  // Build changes the files: git says something else before it than after.
  const later = w.outputs
  w.outputs = {}
  w.stdout = 'before Build'
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)
  w.outputs = later
  w.stdout = ''
  await ends($, w, clock, 1, 'Built it.')

  return ui
}

test('an empty diff fails the Review step instead of passing it', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  const ui = await toReview($, w, clock)

  expect(w.spawned).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /The diff is empty: nothing to review\./ })).toBeDefined()
  await ui.unmount()
})

test('the chat starts the reviewers side by side, duplicates merge, the skeptic confirms one, and Fix these sends the ticked findings to Build', async ($, on) => {
  const w = world(on)
  w.outputs = { 'git status --porcelain': ' M src/run.ts\n', 'git diff HEAD': DIFF }
  const clock = mock.clock(on)
  const ui = await toReview($, w, clock)

  // Build was a1; the three reviewers are a2..a4, from one chat prompt.
  const reviewers = w.spawned.slice(1)
  expect(reviewers.map(s => s.subagentType)).toEqual(['deckhand:reviewer', 'deckhand:typescript-reviewer', 'deckhand:security-auditor'])
  for (const r of reviewers) expect(r.prompt).toContain('step 2/3: Review')
  expect(reviewers[2]!.prompt).toContain('(reviewer name: security-auditor)')
  expect(reviewers.map(r => r.description)).toEqual(['Pipeline 2/3 · Review (reviewer)', 'Pipeline 2/3 · Review (typescript-reviewer)', 'Pipeline 2/3 · Review (security-auditor)'])
  expect([...w.files.keys()].some(k => k.endsWith('02-review.diff'))).toBe(true)

  await ends($, w, clock, 2, [finding({}), finding({ evidence: 'string', title: 'Prefer a type alias', severity: 'low' })].join('\n'))
  // Not all reviewers are done: nothing moves yet.
  expect(w.spawned).toHaveLength(4)
  await ends($, w, clock, 3, finding({ evidence: 'const run', title: 'Name too short', severity: 'high', reviewer: 'typescript-reviewer' }))
  await ends($, w, clock, 4, finding({ line: 2, title: 'Command injection', reviewer: 'security-auditor', severity: 'critical' }))

  // Two serious findings go to the skeptic, which can't edit.
  const skeptic = w.spawned[4]!
  expect(skeptic.subagentType).toBe('deckhand:skeptic')
  expect(skeptic.prompt).toContain('1. [critical] src/run.ts:2 Command injection')
  expect(skeptic.prompt).toContain('2. [high]')
  const denied = await $.tool.call({ tool: 'Write', agentId: 'a5', file_path: 'src/a.ts', content: 'x' } as never)
  expect(JSON.stringify(denied)).toContain('Blocked: skeptic')

  await ends($, w, clock, 5, '{"id":1,"verdict":"confirmed","proof":"exec(cmd) with cmd from the caller"}\n{"id":2,"verdict":"refuted","proof":"only a name"}')

  const report = [...w.files.entries()].find(([k]) => k.endsWith('02-review.md'))![1]
  expect(report).toContain('## Confirmed\n\n- [critical] src/run.ts:2 Command injection (reviewer, security-auditor)')
  expect(report).toContain('## Advice')
  expect(report).toContain('## Refuted')
  expect(await ui.find({ type: 'Text', text: 'needs OK' })).toBeDefined()

  // The gate ticks the critical one; the refuted high and the low start
  // unticked. The owner ticks the low one too, and adds a note.
  expect(await ui.find({ key: 'pipeline-change' })).toBeUndefined()
  await ui.press({ key: 'finding-pick-3' })
  await ui.input({ key: 'pipeline-note', text: 'keep the API' })
  await ui.press({ key: 'pipeline-fix' })
  await playChat($, w, clock)
  const fixes = [...w.files.entries()].find(([k]) => k.endsWith('01-fixes.md'))![1]
  expect(fixes).toContain('src/run.ts:2 Command injection')
  expect(fixes).toContain('Prefer a type alias')
  expect(fixes).not.toContain('Name too short')
  expect(fixes).toContain('## Owner\'s note\n\nkeep the API')

  // Build, not Review, runs next, told to read the fixes file.
  expect(w.spawned[5]!.subagentType).toBe('deckhand:builder')
  expect(w.spawned[5]!.description).toBe('Round 1/3 · Build')
  expect(w.spawned[5]!.prompt).toContain('step 1/3: Build')
  expect(w.spawned[5]!.prompt).toContain('Read .deckhand/pipeline/19700101-000000/01-fixes.md and fix only the items in it')

  // Build again, then Review again on that round's diff; every reviewer finds nothing.
  w.outputs['git diff HEAD'] = `${DIFF}+// fixed\n`
  await ends($, w, clock, 6, 'Fixed.')
  expect(w.spawned[6]!.prompt).toContain('step 2/3: Review')
  expect(w.spawned[6]!.prompt).toContain('Also check each item in .deckhand/pipeline/19700101-000000/01-fixes.md')
  expect(w.spawned[6]!.description).toBe('Round 1/3 · Review (reviewer)')
  expect(w.runs).toContainEqual(['git', 'stash', 'create'])
  for (const n of [7, 8, 9]) await ends($, w, clock, n, 'NO FINDINGS')
  expect(await ui.find({ type: 'Text', text: 'Fix round 1/3 done.' })).toBeDefined()
  await ui.press({ key: 'pipeline-approve' })
  await playChat($, w, clock)
  expect(w.spawned[9]!.subagentType).toBe('deckhand:committer')
  expect(w.spawned[9]!.prompt).toContain('step 3/3: Commit')
  await ui.unmount()
})

test('a review line that won\'t parse fails the step and says why', async ($, on) => {
  const w = world(on)
  w.outputs = { 'git status --porcelain': ' M README.md\n', 'git diff HEAD': '+Some words\n' }
  const clock = mock.clock(on)
  const ui = await toReview($, w, clock)

  expect(w.spawned.map(s => s.subagentType)).toEqual(['deckhand:builder', 'deckhand:reviewer'])
  await ends($, w, clock, 2, `${finding({})}\nLooks fine to me!`)

  expect(w.spawned).toHaveLength(2)
  expect(await ui.find({ type: 'Text', text: /Review line 2 isn't a finding/ })).toBeDefined()
  await ui.unmount()
})

// The fix loop on a one-reviewer change (README only): medium findings, so no skeptic.
const med = (evidence: string) => finding({ severity: 'medium', file: 'README.md', evidence, title: `About ${evidence}` })

async function toGate($: Engine, w: World, clock: { advance: (ms: number) => Promise<void> }, lines: string[], rounds?: number) {
  w.outputs = { 'git status --porcelain': ' M README.md\n', 'git diff HEAD': '+Some words\n' }
  const ui = await toReview($, w, clock, rounds)
  await agentEnds($, w, clock, lines.join('\n'))
  expect(await ui.find({ type: 'Text', text: 'needs OK' })).toBeDefined()
  return ui
}

// One round: Build changes a file, then the reviewer answers `lines`.
async function round($: Engine, w: World, clock: { advance: (ms: number) => Promise<void> }, lines: string[]) {
  w.outputs['git diff HEAD'] += '+more\n'
  await agentEnds($, w, clock, 'Fixed.')
  await agentEnds($, w, clock, lines.length ? lines.join('\n') : 'NO FINDINGS')
}

test('a round with fewer findings runs the next round by itself; a clean second round goes to the Commit gate', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  const ui = await toGate($, w, clock, [med('a()'), med('b()')])
  await ui.press({ key: 'pipeline-fix' })
  await playChat($, w, clock)
  await round($, w, clock, [med('a()')])

  // Round 2 started with no press: Build on the one finding left.
  expect(w.spawned.at(-1)!.description).toBe('Round 2/3 · Build')
  const fixes = [...w.files.entries()].find(([k]) => k.endsWith('01-fixes.md'))![1]
  expect(fixes).toContain('About a()')
  expect(fixes).not.toContain('About b()')
  await round($, w, clock, [])
  expect(await ui.find({ type: 'Text', text: 'Fix round 2/3 done.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Fix loop stopped/ })).toBeUndefined()
  await ui.press({ key: 'pipeline-approve' })
  await playChat($, w, clock)
  expect(w.spawned.at(-1)!.subagentType).toBe('deckhand:committer')
  await ui.unmount()
})

test('the same findings back stop the loop with no progress, at the gate with its three buttons', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  const ui = await toGate($, w, clock, [med('a()')])
  await ui.press({ key: 'pipeline-fix' })
  await playChat($, w, clock)
  // Line numbers and spacing drift; the same file and code is the same finding.
  await round($, w, clock, [finding({ severity: 'medium', file: 'README.md', evidence: ' a() ', title: 'Other words', line: 9 })])

  expect(await ui.find({ type: 'Text', text: 'Fix loop stopped after round 1: no progress, the same findings came back.' })).toBeDefined()
  const spawned = w.spawned.length
  for (const key of ['pipeline-fix', 'pipeline-approve', 'pipeline-stop']) expect(await ui.find({ key })).toBeDefined()
  await playChat($, w, clock)
  expect(w.spawned).toHaveLength(spawned)
  await ui.unmount()
})

test('more new findings than fixed stop the loop as rising and show both lists', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  const ui = await toGate($, w, clock, [med('a()')])
  await ui.press({ key: 'pipeline-fix' })
  await playChat($, w, clock)
  await round($, w, clock, [med('b()'), med('c()')])

  expect(await ui.find({ type: 'Text', text: /rising, 2 new findings and 1 fixed\.\nNew:\n- \[medium\] README\.md:1 About b\(\)\n- \[medium\] README\.md:1 About c\(\)\nFixed:\n- \[medium\] README\.md:1 About a\(\)/ })).toBeDefined()
  await ui.unmount()
})

test('the Max rounds chip caps the loop', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  const ui = await toGate($, w, clock, [med('a()'), med('b()')], 1)
  await ui.press({ key: 'pipeline-fix' })
  await playChat($, w, clock)
  expect(w.spawned.at(-1)!.description).toBe('Round 1/1 · Build')
  await round($, w, clock, [med('a()')])

  expect(await ui.find({ type: 'Text', text: 'Fix loop stopped: it reached the cap of 1 round.' })).toBeDefined()
  expect(w.spawned.at(-1)!.description).toBe('Round 1/1 · Review (reviewer)')
  await ui.unmount()
})
