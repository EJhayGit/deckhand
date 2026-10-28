import { expect, mock, test } from 'claude-code/testing'

import { parseDeck } from '../src/commands'
import { PANE, START, agentFile, personSays, turnEnds, world } from './world'

const deck = (args: string) => ({ command: 'deck', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } })

test('pure: /deck arguments parse', () => {
  expect(parseDeck('')).toEqual({ kind: 'open' })
  expect(parseDeck('  use   bug fixer ')).toEqual({ kind: 'use', name: 'bug fixer' })
  expect(parseDeck('none')).toEqual({ kind: 'none' })
  expect(parseDeck('repeat 10m')).toEqual({ kind: 'repeat', value: '10m' })
  expect(parseDeck('limits')).toEqual({ kind: 'limits' })
  expect(parseDeck('use')).toEqual({ kind: 'help' })
  expect(parseDeck('dance')).toEqual({ kind: 'help' })
  expect(parseDeck('swarm ship-check before the release')).toEqual({ kind: 'swarm', preset: 'ship-check', task: 'before the release' })
  expect(parseDeck('swarm lead')).toEqual({ kind: 'help' })
})

test('/deck swarm starts a preset, or hands the task to the lead', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  await $.session.start(START)

  expect((await $.command.run(deck('swarm nope do it'))).text).toBe('Swarm takes launch-kit, security-sweep, ship-check or lead, then the task.')
  expect((await $.command.run(deck('swarm security-sweep check auth'))).text).toBe('Asked Claude to start Security sweep: security-auditor, dependency-auditor, change-security-review.')
  // A command can't submit while it holds the turn: the prompt goes right after.
  expect(w.submitted).toEqual([])
  await clock.advance(1)
  expect(w.submitted[0]).toContain('`deckhand:security-auditor`: Audit the code for security bugs')
  expect((await $.command.run(deck('swarm lead ship the kit'))).text).toBe('swarm-lead has the task.')
  await clock.advance(1)
  expect(w.submitted[1]).toBe('ship the kit')
})

test('/deck is registered, and opens the panel', async ($, on) => {
  const w = world(on)
  await $.session.start(START)

  const ran = await $.command.run(deck(''))

  expect(ran.text).toBe('Deck opened.')
  expect(w.opened).toEqual(['deck', 'deck'])
})

test('/deck use and /deck none switch the agent', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  await $.session.start(START)

  expect((await $.command.run(deck('use reviewer'))).text).toBe('Using reviewer.')
  expect(w.status.at(-1)).toBe('🔍 reviewer · Haiku · read only')
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await pane.find({ key: 'use-reviewer' }))?.text).toBe('In use')
  await pane.unmount()

  expect((await $.command.run(deck('use ghost'))).text).toMatch(/^No agent called ghost\. Agents: reviewer, .*swarm-lead\.$/)
  expect((await $.command.run(deck('none'))).text).toBe('No agent in use. Claude Code is back to normal.')
  expect(w.status.at(-1)).toBe(undefined)
})

test('/deck limits lists what the agent can do', async ($, on) => {
  world(on, { '.claude/agents/fixer.md': agentFile('fixer', '{ edit: true, run: false, internet: false }') })
  await $.session.start(START)

  expect((await $.command.run(deck('limits'))).text).toBe('No agent is in use, so nothing is limited.')
  await $.command.run(deck('use fixer'))
  expect((await $.command.run(deck('limits'))).text).toBe('fixer can:\nEdit files: on\nRun commands: off\nInternet: off')
})

test('/deck repeat 3 loops the next prompt, and /deck repeat stop ends it', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const clock = mock.clock(on)
  await $.session.start(START)
  await $.command.run(deck('use reviewer'))

  expect((await $.command.run(deck('repeat 3'))).text).toBe('Your next prompt runs 3 times.')
  await $.prompt.submit(personSays('go'))
  await $.turn.complete(turnEnds())
  expect(w.submitted).toEqual(['go', 'go'])
  expect((await $.command.run(deck('repeat stop'))).text).toBe('Repeat stopped.')
  await $.turn.complete(turnEnds('aborted'))
  await clock.advance(60_000)
  expect(w.submitted).toEqual(['go', 'go'])

  expect((await $.command.run(deck('repeat 30m'))).text).toContain('every 30 minutes')
  expect((await $.command.run(deck('repeat 7'))).text).toBe('Repeat takes 3, 10m, 30m, 60m or stop.')
})

test('/deck with unknown words shows usage', async ($, on) => {
  world(on)
  await $.session.start(START)

  expect((await $.command.run(deck('dance'))).text).toContain('Usage: /deck')
})

test('/deck shows agent files added after the session started', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  w.files.set('.claude/agents/late.md', agentFile('late'))

  await $.command.run(deck(''))
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await pane.find({ type: 'Text', text: 'late' })).toBeDefined()
  await pane.unmount()
})
