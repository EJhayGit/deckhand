import { expect, mock, test } from 'claude-code/testing'

import { PANE, START, agentFile, turnEnds, world } from './world'

const ends = (answer: string, reason: 'answer' | 'aborted' | 'error' = 'answer') => ({ ...turnEnds(reason), answer })

test('a Normal Fix stops after Plan; Approve sends Tests; each step\'s answer becomes its result file', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Fix the login redirect loop' })
  await ui.press({ key: 'kind-fix' })
  await ui.press({ key: 'size-normal' })
  await ui.press({ key: 'swarm-start' })

  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0]).toContain('step 1/5: Plan')
  expect(w.submitted[0]).toContain('first the failing test that reproduces the bug')

  // The planner is in use, so the read-only Plan step can't edit.
  const denied = await $.tool.call({ tool: 'Edit', file_path: 'src/a.ts', old_string: 'a', new_string: 'b' } as never)
  expect(JSON.stringify(denied)).toContain('Blocked: planner')

  await $.turn.start({ turnId: 't', text: w.submitted[0] } as never)
  await $.turn.complete(ends('1. Add a failing test\n2. Fix the redirect'))
  await clock.advance(1)
  const plan = [...w.files.entries()].find(([k]) => k.endsWith('01-plan.md'))
  expect(plan?.[1]).toBe('1. Add a failing test\n2. Fix the redirect')
  expect(w.submitted).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: 'needs OK' })).toBeDefined()

  await ui.press({ key: 'pipeline-approve' })
  expect(w.submitted).toHaveLength(2)
  expect(w.submitted[1]).toContain('step 2/5: Tests')
  expect(w.submitted[1]).toContain(plan![0])
  expect(w.submitted[1]).toContain('Write a failing test that reproduces the bug')

  // Tests ends, having written a file: Build goes on its own, with no stop.
  w.outputs['git status --porcelain'] = '?? auth.test.ts\n'
  await $.turn.start({ turnId: 't2', text: w.submitted[1] } as never)
  await $.turn.complete(ends('Added auth.test.ts; it fails.'))
  await clock.advance(1)
  expect(w.submitted).toHaveLength(3)
  expect(w.submitted[2]).toContain('step 3/5: Build')

  // The Runs tab shows each step tagged with its place.
  await ui.press({ key: 'tab-runs' })
  expect(await ui.find({ type: 'Text', text: /Pipeline 2\/5 · Tests/ })).toBeDefined()
  await ui.unmount()
})

test('Change sends the step again with the note, and Stop ends the run and puts the agent back', async ($, on) => {
  const w = world(on, { '.claude/agents/fixer.md': agentFile('fixer', '{ edit: true, run: true, internet: false }') })
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'use-fixer' })

  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add a dark mode toggle' })
  await ui.press({ key: 'size-normal' })
  await ui.press({ key: 'swarm-start' })
  await $.turn.start({ turnId: 't', text: w.submitted[0] } as never)
  await $.turn.complete(ends('the plan'))
  await clock.advance(1)

  await ui.input({ key: 'pipeline-note', text: 'smaller slices' })
  await ui.press({ key: 'pipeline-change' })
  expect(w.submitted).toHaveLength(2)
  expect(w.submitted[1]).toContain('step 1/5: Plan')
  expect(w.submitted[1]).toContain('The owner asked for a change: smaller slices')

  await ui.press({ key: 'pipeline-stop' })
  expect(await ui.find({ type: 'Text', text: 'Pipeline stopped.' })).toBeDefined()
  // A late answer to the stopped step does nothing.
  await $.turn.start({ turnId: 't2', text: w.submitted[1] } as never)
  await $.turn.complete(ends('late'))
  await clock.advance(1)
  expect(w.submitted).toHaveLength(2)

  await ui.press({ key: 'tab-deck' })
  expect(await ui.find({ type: 'Text', text: 'In use: fixer' })).toBeDefined()
  await ui.unmount()
})

test('a step that errors stops the run and shows why', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })
  await ui.press({ key: 'swarm-start' })
  await $.turn.start({ turnId: 't', text: w.submitted[0] } as never)
  await $.turn.complete(ends('', 'error'))
  await clock.advance(1)

  expect(w.submitted).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /Pipeline failed: The step ended with an error\./ })).toBeDefined()
  expect(w.toasts.at(-1)).toContain('Pipeline stopped')
  await ui.press({ key: 'pipeline-new' })
  expect(await ui.find({ key: 'swarm-start' })).toBeDefined()
  await ui.unmount()
})

test('Kind and Size start on Auto, and the reason line follows the task as it is typed', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })

  expect((await ui.find({ key: 'kind-auto' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'size-auto' }))?.props.variant).toBe('primary')

  await ui.input({ key: 'swarm-task', text: 'Fix the typo' })
  expect(await ui.find({ type: 'Text', text: 'Auto: Fix · Tiny (says "fix", says "typo")' })).toBeDefined()
  await ui.input({ key: 'swarm-task', text: 'Fix the login crash' })
  expect(await ui.find({ type: 'Text', text: 'Auto: Fix · Normal (says "fix", mentions login)' })).toBeDefined()

  // A picked size overrides Auto for that row only; Auto again goes back to guessing.
  await ui.press({ key: 'size-big' })
  expect((await ui.find({ key: 'size-auto' }))?.props.variant).toBe('secondary')
  expect(await ui.find({ type: 'Text', text: 'Auto: Fix (says "fix")' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Normal \(/ })).toBeUndefined()
  await ui.press({ key: 'size-auto' })
  expect(await ui.find({ type: 'Text', text: 'Auto: Fix · Normal (says "fix", mentions login)' })).toBeDefined()

  // Start takes the guess: a Normal Fix, so Plan comes first.
  await ui.press({ key: 'swarm-start' })
  expect(w.submitted[0]).toContain('step 1/5: Plan')

  // A plan naming 6+ files bumps the size, and the first stop says so.
  await $.turn.start({ turnId: 't', text: w.submitted[0] } as never)
  await $.turn.complete(ends('1. a.ts\n2. b.ts\n3. c.ts\n4. d.ts\n5. e.ts\n6. f.ts'))
  await clock.advance(1)
  expect(await ui.find({ type: 'Text', text: 'Size bumped to Big: the plan names 6 files.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Fix · Big · / })).toBeDefined()
  await ui.unmount()
})

test('with researcher in use, Start runs Tests as test-writer and Build as the fixer, then puts researcher back', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'use-researcher' })

  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })
  expect(await ui.find({ type: 'Text', text: 'test-writer' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'bug-fixer' })).toBeDefined()
  await ui.press({ key: 'swarm-start' })
  expect(w.submitted[0]).toContain('step 1/4: Tests')

  await ui.press({ key: 'tab-deck' })
  expect(await ui.find({ type: 'Text', text: 'In use: test-writer' })).toBeDefined()
  await ui.press({ key: 'tab-swarm' })
  await ui.press({ key: 'pipeline-stop' })
  await ui.press({ key: 'tab-deck' })
  expect(await ui.find({ type: 'Text', text: 'In use: researcher' })).toBeDefined()
  await clock.advance(1)
  await ui.unmount()
})

test('a read-only agent picked for Tests stops Start until that step uses plain Claude Code', async ($, on) => {
  const w = world(on)
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })

  await ui.press({ key: 'agent-tests' })
  await ui.press({ key: 'step-agent-researcher' })
  await ui.press({ key: 'swarm-start' })
  expect(w.submitted).toEqual([])
  expect(await ui.find({ type: 'Text', text: 'Tests: researcher is missing Edit files, Run commands.' })).toBeDefined()

  await ui.press({ key: 'preflight-plain-tests' })
  await ui.press({ key: 'swarm-start' })
  expect(w.submitted[0]).toContain('step 1/4: Tests')
  await ui.press({ key: 'tab-deck' })
  expect(await ui.find({ type: 'Text', text: /^In use:/ })).toBeUndefined()
  await ui.unmount()
})

test('a step that changed nothing is blocked: the run stops there and offers Retry', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })
  await ui.press({ key: 'swarm-start' })

  await $.turn.start({ turnId: 't', text: w.submitted[0] } as never)
  await $.turn.complete(ends('Wrote the tests.'))
  await clock.advance(1)
  expect(w.submitted).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: 'blocked' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Tests changed no files.' })).toBeDefined()
  expect(await ui.find({ key: 'pipeline-change-agent' })).toBeDefined()
  expect(w.toasts.at(-1)).toBe('Pipeline blocked at Tests: Tests changed no files.')

  await ui.press({ key: 'pipeline-retry' })
  expect(w.submitted).toHaveLength(2)
  expect(w.submitted[1]).toContain('step 1/4: Tests')
  await ui.unmount()
})

test('a needed tool call blocked by the limits blocks the step, even if files changed', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })
  await ui.press({ key: 'swarm-start' })

  // The owner turns Run commands off for test-writer mid-step.
  await ui.press({ key: 'tab-deck' })
  await ui.press({ key: 'can-run' })
  const denied = await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  expect(JSON.stringify(denied)).toContain('Blocked: test-writer')
  w.outputs['git status --porcelain'] = '?? a.test.ts\n'
  await $.turn.start({ turnId: 't', text: w.submitted[0] } as never)
  await $.turn.complete(ends('Wrote a.test.ts but could not run it.'))
  await clock.advance(1)

  await ui.press({ key: 'tab-swarm' })
  expect(w.submitted).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^Blocked: test-writer tried to run `npm test`/ })).toBeDefined()
  expect(await ui.find({ key: 'pipeline-retry' })).toBeDefined()
  await ui.unmount()
})
