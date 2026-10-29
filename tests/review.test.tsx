import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PANE, START, turnEnds, world } from './world'
import type { World } from './world'

const DIFF = 'diff --git a/src/run.ts b/src/run.ts\n+export const run = (cmd: string) => exec(cmd)\n'
const ends = (answer: string) => ({ ...turnEnds(), answer })
const finding = (o: Record<string, unknown>) => JSON.stringify({ severity: 'high', file: 'src/run.ts', line: 1, title: 'Shell injection', evidence: 'exec(cmd)', reviewer: 'reviewer', ...o })

// A Tiny run (Build, Review, Commit) with Build's turn already over.
async function toReview($: Engine, w: World, clock: { advance: (ms: number) => Promise<void> }) {
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Tidy the runner' })
  await ui.press({ key: 'size-tiny' })
  await ui.press({ key: 'swarm-start' })
  await $.turn.start({ turnId: 'b', text: w.submitted[0] } as never)
  await $.turn.complete(ends('Built it.'))
  await clock.advance(1)

  return ui
}

async function answer($: Engine, w: World, clock: { advance: (ms: number) => Promise<void> }, text: string) {
  await $.turn.start({ turnId: `t${w.submitted.length}`, text: w.submitted.at(-1) } as never)
  await $.turn.complete(ends(text))
  await clock.advance(1)
}

test('an empty diff fails the Review step instead of passing it', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  const ui = await toReview($, w, clock)

  expect(w.submitted).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /The diff is empty: nothing to review\./ })).toBeDefined()
  await ui.unmount()
})

test('reviewers fan out, duplicates merge, the skeptic confirms one, and Fix these first sends Build back', async ($, on) => {
  const w = world(on)
  w.outputs = { 'git status --porcelain': ' M src/run.ts\n', 'git diff HEAD': DIFF }
  const clock = mock.clock(on)
  const ui = await toReview($, w, clock)

  const review = w.submitted[1]!
  expect(review).toContain('step 2/3: Review')
  for (const type of ['`deckhand:reviewer`', '`deckhand:typescript-reviewer`', '`deckhand:security-auditor`']) expect(review).toContain(type)
  expect([...w.files.keys()].some(k => k.endsWith('02-review.diff'))).toBe(true)

  await answer($, w, clock, [
    finding({}),
    finding({ line: 2, title: 'Command injection', reviewer: 'security-auditor', severity: 'critical' }),
    finding({ evidence: 'const run', title: 'Name too short', severity: 'high', reviewer: 'typescript-reviewer' }),
    finding({ evidence: 'string', title: 'Prefer a type alias', severity: 'low' }),
  ].join('\n'))

  // Two serious findings go to the skeptic, who is now in use and can't edit.
  const skeptic = w.submitted[2]!
  expect(skeptic).toContain('1. [critical] src/run.ts:2 Command injection')
  expect(skeptic).toContain('2. [high]')
  const denied = await $.tool.call({ tool: 'Write', file_path: 'src/a.ts', content: 'x' } as never)
  expect(JSON.stringify(denied)).toContain('Blocked: skeptic')

  await answer($, w, clock, '{"id":1,"verdict":"confirmed","proof":"exec(cmd) with cmd from the caller"}\n{"id":2,"verdict":"refuted","proof":"only a name"}')

  const report = [...w.files.entries()].find(([k]) => k.endsWith('02-review.md'))![1]
  expect(report).toContain('## Confirmed\n\n- [critical] src/run.ts:2 Command injection (reviewer, security-auditor)')
  expect(report).toContain('## Advice')
  expect(report).toContain('## Refuted')
  expect(await ui.find({ type: 'Text', text: 'needs OK' })).toBeDefined()

  await ui.press({ key: 'pipeline-fix' })
  expect(w.submitted[3]).toContain('step 1/3: Build')
  expect(w.submitted[3]).toContain('Fix these review findings first:\n- src/run.ts:2 Command injection')

  // Build again, then Review again.
  await answer($, w, clock, 'Fixed.')
  expect(w.submitted[4]).toContain('step 2/3: Review')
  await answer($, w, clock, 'NO FINDINGS')
  expect(await ui.find({ key: 'pipeline-fix' })).toBeUndefined()
  await ui.press({ key: 'pipeline-approve' })
  expect(w.submitted[5]).toContain('step 3/3: Commit')
  await ui.unmount()
})

test('a review line that won\'t parse fails the step and says why', async ($, on) => {
  const w = world(on)
  w.outputs = { 'git status --porcelain': ' M README.md\n', 'git diff HEAD': '+Some words\n' }
  const clock = mock.clock(on)
  const ui = await toReview($, w, clock)

  expect(w.submitted[1]).not.toContain('typescript-reviewer')
  await answer($, w, clock, `${finding({})}\nLooks fine to me!`)

  expect(w.submitted).toHaveLength(2)
  expect(await ui.find({ type: 'Text', text: /Review line 2 isn't a finding/ })).toBeDefined()
  await ui.unmount()
})
