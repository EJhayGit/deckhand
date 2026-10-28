import { expect, mock, test } from 'claude-code/testing'

import { parallelPrompt } from '../src/swarm'
import { PANE, START, turnEnds, world } from './world'

const OFFER = { agent: 'deckhand:reviewer', description: '', source: 'plugin', provider: { plugin: 'deckhand', tier: 'user' } } as never

test('pure: the parallel prompt names each agent type and its part', () => {
  const text = parallelPrompt('Ship it', [{ type: 'deckhand:reviewer', part: 'Review the whole kit' }, { type: 'fixer', part: 'Fixes bugs.' }])

  expect(text).toContain('Ship it')
  expect(text).toContain('1. `deckhand:reviewer`: Review the whole kit')
  expect(text).toContain('2. `fixer`: Fixes bugs.')
  expect(text).toContain('Do none of the parts\nyourself.')
})

test('Parallel sends one visible prompt asking Claude to start each pick, and offers the built-ins until that turn ends', async ($, on) => {
  const w = world(on)
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-swarm' })
  await ui.press({ key: 'swarm-start' })
  expect(await ui.find({ type: 'Text', text: 'Type the task first.' })).toBeDefined()
  expect(w.submitted).toEqual([])

  await ui.input({ key: 'swarm-task', text: 'Launch the new pricing page' })
  await ui.press({ key: 'swarm-start' })

  expect(w.submitted).toHaveLength(1)
  const sent = w.submitted[0]!
  expect(sent).toContain('Launch the new pricing page')
  for (const line of ['`deckhand:researcher`: Research competitor launches', '`deckhand:frontend-designer`: Build the landing page', '`deckhand:graphics-designer`: Design the launch graphics', '`deckhand:reviewer`: Review the whole kit']) {
    expect(sent).toContain(line)
  }
  expect(w.spawned).toEqual([])
  expect(await ui.find({ key: 'tile-Cost' })).toBeDefined()

  expect(await $.agent.offer(OFFER)).not.toEqual({ isOffered: false })
  await $.turn.start({ turnId: 't', text: sent } as never)
  await $.turn.complete(turnEnds())
  expect(await $.agent.offer(OFFER)).toEqual({ isOffered: false })
  await ui.unmount()
})

test('Custom picks ask only for the picked agents, a project one by its file name', async ($, on) => {
  const w = world(on, { '.claude/agents/fixer.md': '---\nname: fixer\ndescription: Fixes bugs.\n---\nFix it.\n' })
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'tab-swarm' })
  for (const name of ['researcher', 'frontend-designer', 'graphics-designer', 'reviewer']) await ui.press({ key: `pick-${name}` })
  await ui.press({ key: 'pick-fixer' })
  await ui.input({ key: 'swarm-task', text: 'Fix the login bug' })
  await ui.press({ key: 'swarm-start' })

  expect(w.submitted[0]).toContain('1. `fixer`: Fixes bugs.')
  expect(w.submitted[0]).not.toContain('2. ')
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
  expect(w.status.at(-1)).toContain('swarm-lead')
  // While the lead is in use, the built-ins are offered to the model.
  expect(await $.agent.offer(OFFER)).not.toEqual({ isOffered: false })
  await ui.unmount()
})
