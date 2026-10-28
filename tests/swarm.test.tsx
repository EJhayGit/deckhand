import { expect, mock, test } from 'claude-code/testing'

import { parseAgent } from '../src/agents/format'
import { spawnArgs } from '../src/swarm'
import { PANE, START, world } from './world'

test('pure: a built-in spawns by its registered type, a project agent by its file name', () => {
  const agent = parseAgent('---\nname: fixer\ndescription: Fixes bugs.\n---\nFix it.\n').agent
  const builtin = spawnArgs({ agent: { ...agent, name: 'reviewer' }, source: 'builtin', isInLibrary: false, text: '', agentType: 'deckhand:reviewer' }, 'launch-kit', 'Ship it')
  const project = spawnArgs({ agent, source: 'project', isInLibrary: false, text: '', agentType: 'fixer' }, 'custom', 'Fix login')

  expect(builtin.subagentType).toBe('deckhand:reviewer')
  expect(builtin.description).toBe('Review the whole kit')
  expect(builtin.prompt).toContain('Ship it')
  expect(project.subagentType).toBe('fixer')
  expect(project.description).toBe('Fixes bugs.')
})

test('Parallel starts one agent per pick, each with its own part', async ($, on) => {
  const w = world(on)
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-swarm' })
  await ui.press({ key: 'swarm-start' })
  expect(await ui.find({ type: 'Text', text: 'Type the task first.' })).toBeDefined()
  expect(w.spawned).toEqual([])

  await ui.input({ key: 'swarm-task', text: 'Launch the new pricing page' })
  await ui.press({ key: 'swarm-start' })

  expect(w.spawned.map(s => s.description)).toEqual(['Research competitor launches', 'Build the landing page', 'Design the launch graphics', 'Review the whole kit'])
  expect(w.spawned[1]?.prompt).toContain('Launch the new pricing page')
  expect(w.spawned[1]?.prompt).toContain('Your part: Build the landing page')
  // Start switches to Runs. The rows need the agent ids the real engine sets
  // (the test engine strips them from a spawn the world answered); the runs
  // tests cover rows.
  expect(await ui.find({ key: 'tile-Cost' })).toBeDefined()
  await ui.unmount()
})

test('Custom picks start only the picked agents', async ($, on) => {
  const w = world(on, { '.claude/agents/fixer.md': '---\nname: fixer\ndescription: Fixes bugs.\n---\nFix it.\n' })
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'tab-swarm' })
  for (const name of ['researcher', 'frontend-designer', 'graphics-designer', 'reviewer']) await ui.press({ key: `pick-${name}` })
  await ui.press({ key: 'pick-fixer' })
  await ui.input({ key: 'swarm-task', text: 'Fix the login bug' })
  await ui.press({ key: 'swarm-start' })

  expect(w.spawned.map(s => s.description)).toEqual(['Fixes bugs.'])
  await ui.unmount()
})

test('Lead makes swarm-lead active and sends the task to the chat', async ($, on) => {
  const w = world(on)
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-swarm' })
  await ui.press({ key: 'mode-lead' })
  await ui.input({ key: 'swarm-task', text: 'Ship the launch kit' })
  await ui.press({ key: 'swarm-start' })

  expect(w.submitted).toEqual(['Ship the launch kit'])
  expect(w.spawned).toEqual([])
  expect(w.status.at(-1)).toContain('swarm-lead')
  // While the lead is in use, the built-ins are offered to the model.
  expect(await $.agent.offer({ agent: 'deckhand:reviewer', description: '', source: 'plugin', provider: { plugin: 'deckhand', tier: 'user' } } as never)).not.toEqual({ isOffered: false })
  await ui.unmount()
})
