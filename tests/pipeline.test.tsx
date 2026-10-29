import { expect, mock, test } from 'claude-code/testing'

import { PANE, START, agentEnds, agentFile, playChat, turnEnds, world } from './world'

test('a Normal Fix stops after Plan; Approve sends Tests; each step agent\'s own answer becomes its result file', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Fix the login redirect loop' })
  await ui.press({ key: 'kind-fix' })
  await ui.press({ key: 'size-normal' })
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)

  // Start types the step into the chat, which starts the planner in the
  // foreground under the step's Runs title.
  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0]).toContain('subagent_type `deckhand:planner`')
  expect(w.spawned).toHaveLength(1)
  expect(w.spawned[0]!.subagentType).toBe('deckhand:planner')
  expect(w.spawned[0]!.background).toBe(false)
  expect(w.spawned[0]!.description).toBe('Pipeline 1/5 · Plan')
  expect(w.spawned[0]!.prompt).toContain('step 1/5: Plan')
  expect(w.spawned[0]!.prompt).toContain('first the failing test that reproduces the bug')
  expect(await ui.find({ type: 'Text', text: 'subagent: planner' })).toBeDefined()

  // The planner subagent keeps its own limits: it can't edit.
  const denied = await $.tool.call({ tool: 'Edit', agentId: 'a1', file_path: 'src/a.ts', old_string: 'a', new_string: 'b' } as never)
  expect(JSON.stringify(denied)).toContain('Blocked: planner')

  await agentEnds($, w, clock, '1. Add a failing test\n2. Fix the redirect')
  const plan = [...w.files.entries()].find(([k]) => k.endsWith('01-plan.md'))
  expect(plan?.[1]).toBe('1. Add a failing test\n2. Fix the redirect')
  expect(w.spawned).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: 'needs OK' })).toBeDefined()

  await ui.press({ key: 'pipeline-approve' })
  await playChat($, w, clock)
  expect(w.spawned).toHaveLength(2)
  expect(w.spawned[1]!.subagentType).toBe('deckhand:test-writer')
  expect(w.spawned[1]!.prompt).toContain('step 2/5: Tests')
  expect(w.spawned[1]!.prompt).toContain(plan![0])
  expect(w.spawned[1]!.prompt).toContain('Write a failing test that reproduces the bug')

  // Tests ends, having written a file: Build is spawned on its own, with no stop.
  w.outputs['git status --porcelain'] = '?? auth.test.ts\n'
  await agentEnds($, w, clock, 'Added auth.test.ts; it fails.')
  expect(w.spawned).toHaveLength(3)
  expect(w.spawned[2]!.subagentType).toBe('deckhand:builder')
  expect(w.spawned[2]!.prompt).toContain('step 3/5: Build')

  // The Runs tab shows each step's subagent tagged with its place.
  await ui.press({ key: 'tab-runs' })
  expect(await ui.find({ type: 'Text', text: /Pipeline 2\/5 · Tests/ })).toBeDefined()
  await ui.unmount()
})

test('Change spawns the step again with the note; Stop ends the run and leaves the agent in use alone', async ($, on) => {
  const w = world(on, { '.claude/agents/fixer.md': agentFile('fixer', '{ edit: true, run: true, internet: false }') })
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'use-fixer' })

  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add a dark mode toggle' })
  await ui.press({ key: 'size-normal' })
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)
  await agentEnds($, w, clock, 'the plan')

  await ui.input({ key: 'pipeline-note', text: 'smaller slices' })
  await ui.press({ key: 'pipeline-change' })
  await playChat($, w, clock)
  expect(w.spawned).toHaveLength(2)
  expect(w.spawned[1]!.prompt).toContain('step 1/5: Plan')
  expect(w.spawned[1]!.prompt).toContain('The owner asked for a change: smaller slices')

  await ui.press({ key: 'pipeline-stop' })
  expect(await ui.find({ type: 'Text', text: 'Pipeline stopped.' })).toBeDefined()
  // A late answer from the stopped step's agent does nothing.
  await agentEnds($, w, clock, 'late')
  expect(w.spawned).toHaveLength(2)

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
  await playChat($, w, clock)
  await agentEnds($, w, clock, '', 'error')

  expect(w.spawned).toHaveLength(1)
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
  await playChat($, w, clock)
  expect(w.spawned[0]!.prompt).toContain('step 1/5: Plan')

  // A plan naming 6+ files bumps the size, and the first stop says so.
  await agentEnds($, w, clock, '1. a.ts\n2. b.ts\n3. c.ts\n4. d.ts\n5. e.ts\n6. f.ts')
  expect(await ui.find({ type: 'Text', text: 'Size bumped to Big: the plan names 6 files.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Fix · Big · / })).toBeDefined()
  await ui.unmount()
})

test('with researcher in use, Start sends test-writer, which can edit; Build sends the builder; researcher stays in use', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  // Beneath the plugin, a tool call that gets through just succeeds.
  on('tool.call', () => ({ result: 'edited' }) as never)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'use-researcher' })

  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })
  expect(await ui.find({ type: 'Text', text: 'test-writer' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'builder' })).toBeDefined()
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)
  expect(w.spawned[0]!.subagentType).toBe('deckhand:test-writer')
  expect(w.spawned[0]!.prompt).toContain('step 1/4: Tests')

  // The test-writer subagent edits even though researcher is in use in the chat.
  const edited = await $.tool.call({ tool: 'Edit', agentId: 'a1', file_path: 'a.test.ts', old_string: 'a', new_string: 'b' } as never)
  expect(JSON.stringify(edited)).not.toContain('Blocked')
  // The chat itself still has researcher's limits, but its denial doesn't block the step.
  const chat = await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'a', new_string: 'b' } as never)
  expect(JSON.stringify(chat)).toContain('Blocked: researcher')
  expect(await ui.find({ key: 'pipeline-retry' })).toBeUndefined()

  w.outputs['git status --porcelain'] = '?? a.test.ts\n'
  await agentEnds($, w, clock, 'Wrote a.test.ts.')
  expect(w.spawned[1]!.subagentType).toBe('deckhand:builder')

  await ui.press({ key: 'tab-deck' })
  expect(await ui.find({ type: 'Text', text: 'In use: researcher' })).toBeDefined()
  await ui.unmount()
})

test('a read-only agent picked for Tests stops Start until that step uses plain Claude Code', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })

  await ui.press({ key: 'agent-tests' })
  await ui.press({ key: 'step-agent-researcher' })
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)
  expect(w.spawned).toEqual([])
  expect(await ui.find({ type: 'Text', text: 'Tests: researcher is missing Edit files, Run commands.' })).toBeDefined()

  await ui.press({ key: 'preflight-plain-tests' })
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)
  expect(w.spawned[0]!.subagentType).toBe('general-purpose')
  expect(w.spawned[0]!.prompt).toContain('step 1/4: Tests')
  await ui.unmount()
})

test('a deck card is put on a Pipeline step with Put on step, and Start uses it', async ($, on) => {
  const w = world(on, { '.claude/agents/fixer.md': agentFile('fixer', '{ edit: true, run: true, internet: false }') })
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })
  await ui.press({ key: 'tab-deck' })

  await ui.press({ key: 'more-fixer' })
  await ui.press({ key: 'place-fixer-tests' })
  expect(await ui.find({ key: 'agent-tests' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'fixer' })).toBeDefined()

  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)
  expect(w.spawned[0]!.subagentType).toBe('fixer')
  expect(w.spawned[0]!.prompt).toContain('step 1/4: Tests')
  await ui.unmount()
})

test('the step track shows each step card with its status as the run moves', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Fix the login redirect loop' })
  await ui.press({ key: 'kind-fix' })
  await ui.press({ key: 'size-normal' })
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)
  await agentEnds($, w, clock, 'the plan')

  expect(await ui.find({ type: 'Text', text: /✓ done/ })).toBeDefined()
  await ui.press({ key: 'agent-tests' })
  expect(await ui.find({ key: 'step-agent-cancel' })).toBeDefined()
  await ui.press({ key: 'pipeline-approve' })
  await playChat($, w, clock)
  expect(await ui.find({ type: 'Text', text: /✓ done/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▶ running/ })).toBeDefined()
  // A done step keeps its result file; the picker closed once Tests started.
  expect(await ui.find({ type: 'Text', text: /01-plan\.md/ })).toBeDefined()
  expect(await ui.find({ key: 'step-agent-cancel' })).toBeUndefined()
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
  await playChat($, w, clock)

  await agentEnds($, w, clock, 'Wrote the tests.')
  expect(w.spawned).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: 'blocked' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Tests changed no files.' })).toBeDefined()
  expect(await ui.find({ key: 'pipeline-change-agent' })).toBeDefined()
  expect(w.toasts.at(-1)).toBe('Pipeline blocked at Tests: Tests changed no files.')

  await ui.press({ key: 'pipeline-retry' })
  await playChat($, w, clock)
  expect(w.spawned).toHaveLength(2)
  expect(w.spawned[1]!.prompt).toContain('step 1/4: Tests')
  await ui.unmount()
})

test('a step whose answer says a needed tool call was blocked is blocked, even if files changed', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)

  w.outputs['git status --porcelain'] = '?? a.test.ts\n'
  await agentEnds($, w, clock, 'Wrote a.test.ts.\nBlocked: test-writer tried to run `npm test`, but Run commands is off for this agent.')

  expect(w.spawned).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^Blocked: test-writer tried to run `npm test`/ })).toBeDefined()
  expect(await ui.find({ key: 'pipeline-retry' })).toBeDefined()
  await ui.unmount()
})

test('the step waits for its agent: a chat turn that ends first doesn\'t finish the step', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-normal' })
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)

  // The chat's turn ends while the planner still runs (as a background agent would).
  w.open = undefined
  await $.turn.complete({ ...turnEnds(), answer: 'The planner is running in the background. I\'ll pass on its answer.' })
  await clock.advance(1)
  expect(await ui.find({ type: 'Text', text: 'needs OK' })).toBeUndefined()
  expect([...w.files.keys()].some(k => k.endsWith('01-plan.md'))).toBe(false)

  // Only the planner's own answer finishes the step.
  await agentEnds($, w, clock, '1. Add the toggle')
  expect([...w.files.entries()].find(([k]) => k.endsWith('01-plan.md'))?.[1]).toBe('1. Add the toggle')
  expect(await ui.find({ type: 'Text', text: 'needs OK' })).toBeDefined()
  await ui.unmount()
})

test('a chat turn that starts no agent blocks the step; Retry sends it again', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })
  w.spawnDeny = 'auto mode refused it'
  await ui.press({ key: 'swarm-start' })
  await playChat($, w, clock)
  expect(w.spawned).toEqual([])

  await $.turn.complete({ ...turnEnds(), answer: 'I could not start it.' })
  await clock.advance(1)
  expect(await ui.find({ type: 'Text', text: 'The chat didn\'t start the Tests agent. Retry, or pick another agent.' })).toBeDefined()

  w.spawnDeny = undefined
  await ui.press({ key: 'pipeline-retry' })
  await playChat($, w, clock)
  expect(w.submitted).toHaveLength(2)
  expect(w.spawned[0]!.subagentType).toBe('deckhand:test-writer')
  expect(w.spawned[0]!.prompt).toContain('step 1/4: Tests')
  await ui.unmount()
})
