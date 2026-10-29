import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PANE, START, agentFile, turnEnds, world } from './world'
import type { World } from './world'

// The last spawned subagent ends with this answer.
async function agentEnds($: Engine, w: World, clock: { advance: (ms: number) => Promise<void> }, answer: string, reason: 'answer' | 'aborted' | 'error' = 'answer') {
  await $.turn.complete({ ...turnEnds(reason, `a${w.spawned.length}`), answer })
  await clock.advance(1)
}

test('a Normal Fix stops after Plan; Approve spawns Tests; each subagent\'s answer becomes its result file', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Fix the login redirect loop' })
  await ui.press({ key: 'kind-fix' })
  await ui.press({ key: 'size-normal' })
  await ui.press({ key: 'swarm-start' })

  // Deckhand spawns the planner itself; nothing is typed into the chat.
  expect(w.submitted).toEqual([])
  expect(w.spawned).toHaveLength(1)
  expect(w.spawned[0]!.subagentType).toBe('deckhand:planner')
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
  expect(w.submitted).toEqual([])

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
  await agentEnds($, w, clock, 'the plan')

  await ui.input({ key: 'pipeline-note', text: 'smaller slices' })
  await ui.press({ key: 'pipeline-change' })
  expect(w.spawned).toHaveLength(2)
  expect(w.spawned[1]!.prompt).toContain('step 1/5: Plan')
  expect(w.spawned[1]!.prompt).toContain('The owner asked for a change: smaller slices')

  await ui.press({ key: 'pipeline-stop' })
  expect(await ui.find({ type: 'Text', text: 'Pipeline stopped.' })).toBeDefined()
  // A late answer from the stopped step's subagent does nothing.
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
  expect(w.spawned[0]!.prompt).toContain('step 1/5: Plan')

  // A plan naming 6+ files bumps the size, and the first stop says so.
  await agentEnds($, w, clock, '1. a.ts\n2. b.ts\n3. c.ts\n4. d.ts\n5. e.ts\n6. f.ts')
  expect(await ui.find({ type: 'Text', text: 'Size bumped to Big: the plan names 6 files.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Fix · Big · / })).toBeDefined()
  await ui.unmount()
})

test('with researcher in use, Start spawns test-writer, which can edit; Build spawns the builder; researcher stays in use', async ($, on) => {
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
  expect(w.spawned[0]!.subagentType).toBe('deckhand:test-writer')
  expect(w.spawned[0]!.prompt).toContain('step 1/4: Tests')
  expect(w.submitted).toEqual([])

  // The test-writer subagent edits even though researcher is in use in the chat.
  const edited = await $.tool.call({ tool: 'Edit', agentId: 'a1', file_path: 'a.test.ts', old_string: 'a', new_string: 'b' } as never)
  expect(JSON.stringify(edited)).not.toContain('Blocked')
  // The chat itself still has researcher's limits.
  const chat = await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'a', new_string: 'b' } as never)
  expect(JSON.stringify(chat)).toContain('Blocked: researcher')

  w.outputs['git status --porcelain'] = '?? a.test.ts\n'
  await agentEnds($, w, clock, 'Wrote a.test.ts.')
  expect(w.spawned[1]!.subagentType).toBe('deckhand:builder')

  await ui.press({ key: 'tab-deck' })
  expect(await ui.find({ type: 'Text', text: 'In use: researcher' })).toBeDefined()
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
  expect(w.spawned).toEqual([])
  expect(await ui.find({ type: 'Text', text: 'Tests: researcher is missing Edit files, Run commands.' })).toBeDefined()

  await ui.press({ key: 'preflight-plain-tests' })
  await ui.press({ key: 'swarm-start' })
  expect(w.spawned[0]!.subagentType).toBe('general-purpose')
  expect(w.spawned[0]!.prompt).toContain('step 1/4: Tests')
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

  await agentEnds($, w, clock, 'Wrote the tests.')
  expect(w.spawned).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: 'blocked' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Tests changed no files.' })).toBeDefined()
  expect(await ui.find({ key: 'pipeline-change-agent' })).toBeDefined()
  expect(await ui.find({ key: 'pipeline-chat' })).toBeUndefined()
  expect(w.toasts.at(-1)).toBe('Pipeline blocked at Tests: Tests changed no files.')

  await ui.press({ key: 'pipeline-retry' })
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

  w.outputs['git status --porcelain'] = '?? a.test.ts\n'
  await agentEnds($, w, clock, 'Wrote a.test.ts.\nBlocked: test-writer tried to run `npm test`, but Run commands is off for this agent.')

  expect(w.spawned).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^Blocked: test-writer tried to run `npm test`/ })).toBeDefined()
  expect(await ui.find({ key: 'pipeline-retry' })).toBeDefined()
  await ui.unmount()
})

test('a refused spawn blocks the step; Send through chat asks the chat to start that agent', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-swarm' })
  await ui.input({ key: 'swarm-task', text: 'Add dark mode' })
  await ui.press({ key: 'size-small' })
  w.spawnDeny = 'auto mode refused it'
  await ui.press({ key: 'swarm-start' })

  expect(w.spawned).toEqual([])
  expect(await ui.find({ type: 'Text', text: 'Claude Code didn\'t start deckhand:test-writer: auto mode refused it' })).toBeDefined()
  expect(w.submitted).toEqual([])

  w.spawnDeny = undefined
  await ui.press({ key: 'pipeline-chat' })
  expect(w.submitted).toHaveLength(1)
  expect(w.submitted[0]).toContain('subagent_type `deckhand:test-writer`')
  expect(w.submitted[0]).toContain('step 1/4: Tests')

  // The chat's answer counts as the step's; Build is spawned directly again.
  w.outputs['git status --porcelain'] = '?? a.test.ts\n'
  await $.turn.start({ turnId: 't', text: w.submitted[0] } as never)
  await $.turn.complete({ ...turnEnds(), answer: 'Wrote a.test.ts.' })
  await clock.advance(1)
  expect(w.spawned[0]!.subagentType).toBe('deckhand:builder')
  expect(w.spawned[0]!.prompt).toContain('step 2/4: Build')
  await ui.unmount()
})
