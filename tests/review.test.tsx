import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PANE, START, turnEnds, world } from './world'
import type { World } from './world'

const DIFF = 'diff --git a/src/run.ts b/src/run.ts\n+export const run = (cmd: string) => exec(cmd)\n'
const finding = (o: Record<string, unknown>) => JSON.stringify({ severity: 'high', file: 'src/run.ts', line: 1, title: 'Shell injection', evidence: 'exec(cmd)', reviewer: 'reviewer', ...o })

// The subagent spawned as number `n` (1-based) ends with `text`.
async function ends($: Engine, clock: { advance: (ms: number) => Promise<void> }, n: number, text: string) {
  await $.turn.complete({ ...turnEnds('answer', `a${n}`), answer: text })
  await clock.advance(1)
}

// A Tiny run (Build, Review, Commit) with Build's subagent already over.
async function toReview($: Engine, w: World, clock: { advance: (ms: number) => Promise<void> }) {
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Tidy the runner' })
  await ui.press({ key: 'size-tiny' })
  // Build changes the files: git says something else before it than after.
  const later = w.outputs
  w.outputs = {}
  w.stdout = 'before Build'
  await ui.press({ key: 'swarm-start' })
  w.outputs = later
  w.stdout = ''
  await ends($, clock, 1, 'Built it.')

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

test('reviewers are spawned side by side, duplicates merge, the skeptic confirms one, and Fix these first sends Build back', async ($, on) => {
  const w = world(on)
  w.outputs = { 'git status --porcelain': ' M src/run.ts\n', 'git diff HEAD': DIFF }
  const clock = mock.clock(on)
  const ui = await toReview($, w, clock)

  // Build was a1; the three reviewers are a2..a4, each with its own prompt.
  const reviewers = w.spawned.slice(1)
  expect(reviewers.map(s => s.subagentType)).toEqual(['deckhand:reviewer', 'deckhand:typescript-reviewer', 'deckhand:security-auditor'])
  for (const r of reviewers) expect(r.prompt).toContain('step 2/3: Review')
  expect(reviewers[2]!.prompt).toContain('reviewer is "security-auditor"')
  expect([...w.files.keys()].some(k => k.endsWith('02-review.diff'))).toBe(true)
  expect(w.submitted).toEqual([])

  await ends($, clock, 2, [finding({}), finding({ evidence: 'string', title: 'Prefer a type alias', severity: 'low' })].join('\n'))
  // Not all reviewers are done: nothing moves yet.
  expect(w.spawned).toHaveLength(4)
  await ends($, clock, 3, finding({ evidence: 'const run', title: 'Name too short', severity: 'high', reviewer: 'typescript-reviewer' }))
  await ends($, clock, 4, finding({ line: 2, title: 'Command injection', reviewer: 'security-auditor', severity: 'critical' }))

  // Two serious findings go to the skeptic subagent, which can't edit.
  const skeptic = w.spawned[4]!
  expect(skeptic.subagentType).toBe('deckhand:skeptic')
  expect(skeptic.prompt).toContain('1. [critical] src/run.ts:2 Command injection')
  expect(skeptic.prompt).toContain('2. [high]')
  const denied = await $.tool.call({ tool: 'Write', agentId: 'a5', file_path: 'src/a.ts', content: 'x' } as never)
  expect(JSON.stringify(denied)).toContain('Blocked: skeptic')

  await ends($, clock, 5, '{"id":1,"verdict":"confirmed","proof":"exec(cmd) with cmd from the caller"}\n{"id":2,"verdict":"refuted","proof":"only a name"}')

  const report = [...w.files.entries()].find(([k]) => k.endsWith('02-review.md'))![1]
  expect(report).toContain('## Confirmed\n\n- [critical] src/run.ts:2 Command injection (reviewer, security-auditor)')
  expect(report).toContain('## Advice')
  expect(report).toContain('## Refuted')
  expect(await ui.find({ type: 'Text', text: 'needs OK' })).toBeDefined()

  await ui.press({ key: 'pipeline-fix' })
  expect(w.spawned[5]!.prompt).toContain('step 1/3: Build')
  expect(w.spawned[5]!.prompt).toContain('Fix these review findings first:\n- src/run.ts:2 Command injection')

  // Build again, then Review again; every reviewer finds nothing.
  w.outputs['git diff HEAD'] = `${DIFF}+// fixed\n`
  await ends($, clock, 6, 'Fixed.')
  expect(w.spawned[6]!.prompt).toContain('step 2/3: Review')
  for (const n of [7, 8, 9]) await ends($, clock, n, 'NO FINDINGS')
  expect(await ui.find({ key: 'pipeline-fix' })).toBeUndefined()
  await ui.press({ key: 'pipeline-approve' })
  expect(w.spawned[9]!.subagentType).toBe('general-purpose')
  expect(w.spawned[9]!.prompt).toContain('step 3/3: Commit')
  await ui.unmount()
})

test('a review line that won\'t parse fails the step and says why', async ($, on) => {
  const w = world(on)
  w.outputs = { 'git status --porcelain': ' M README.md\n', 'git diff HEAD': '+Some words\n' }
  const clock = mock.clock(on)
  const ui = await toReview($, w, clock)

  expect(w.spawned.map(s => s.subagentType)).toEqual(['deckhand:bug-fixer', 'deckhand:reviewer'])
  await ends($, clock, 2, `${finding({})}\nLooks fine to me!`)

  expect(w.spawned).toHaveLength(2)
  expect(await ui.find({ type: 'Text', text: /Review line 2 isn't a finding/ })).toBeDefined()
  await ui.unmount()
})
