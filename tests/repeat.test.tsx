import { expect, mock, test } from 'claude-code/testing'

import type { Engine } from 'claude-code/testing'

import { afterTurn, start, tick } from '../src/repeat'
import { PANE, START, agentFile, personSays, turnEnds, world } from './world'

test('pure: 3× runs three times, then stops as done', () => {
  let loop = start('x3', 'fix it', null)!
  expect(loop.run).toBe(1)
  const two = afterTurn(loop, 'answer')
  expect(two.action).toBe('submit')
  loop = two.loop!
  loop = afterTurn(loop, 'answer').loop!
  expect(loop.run).toBe(3)
  expect(afterTurn(loop, 'answer')).toEqual({ loop: null, action: 'stop', why: 'done' })
})

test('pure: an error or interruption stops any loop', () => {
  for (const mode of ['x3', 'm10'] as const) {
    const loop = start(mode, 'go', null)!
    expect(afterTurn(loop, 'error').action).toBe('stop')
    expect(afterTurn(loop, 'aborted').action).toBe('stop')
  }
})

test('pure: never two at once', () => {
  const running = start('m10', 'go', null)!
  expect(start('x3', 'other', running)).toBe(running)
  expect(tick(running).action).toBe('none')
  const waiting = afterTurn(running, 'answer').loop!
  expect(tick(waiting).action).toBe('submit')
  expect(start('once', 'go', null)).toBe(null)
})

async function setup($: Engine, mode: string) {
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'use-reviewer' })
  await pane.unmount()
  const band = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await band.press({ key: `repeat-${mode}` })
  return band
}

test('3× resends the prompt after each turn and stops after the third', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  mock.clock(on)
  await $.session.start(START)
  const band = await setup($, 'x3')

  await $.prompt.submit(personSays('review src'))
  expect(await band.find({ key: 'stop' })).toBeDefined()
  await $.turn.complete(turnEnds())
  expect(w.submitted).toEqual(['review src', 'review src'])
  expect(await band.find({ key: 'stop' })).toBeDefined()
  await $.turn.complete(turnEnds())
  await $.turn.complete(turnEnds())
  await $.turn.complete(turnEnds())

  expect(w.submitted).toEqual(['review src', 'review src', 'review src'])
  expect(w.toasts.at(-1)).toBe('Loop done.')
  expect(await band.find({ key: 'stop' })).toBeUndefined()
  await band.unmount()
})

test('a timer resends every 10 minutes after the turn ends, and only then', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const clock = mock.clock(on)
  await $.session.start(START)
  const band = await setup($, 'm10')

  await $.prompt.submit(personSays('check CI'))
  await clock.advance(20 * 60_000)
  expect(w.submitted).toEqual(['check CI'])

  await $.turn.complete(turnEnds())
  await clock.advance(9 * 60_000)
  expect(w.submitted).toEqual(['check CI'])
  await clock.advance(60_000)
  expect(w.submitted).toEqual(['check CI', 'check CI'])
  await clock.advance(60 * 60_000)
  expect(w.submitted).toEqual(['check CI', 'check CI'])
  // Still looping: the second turn hasn't ended, so Stop stays.
  expect(await band.find({ key: 'stop' })).toBeDefined()
  await band.unmount()
})

test('Stop ends a timer loop: no more sends, and the running turn is cancelled', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const clock = mock.clock(on)
  await $.session.start(START)
  const band = await setup($, 'm30')

  await $.turn.start({ text: 'watch', turnId: 'main-1' })
  await $.prompt.submit(personSays('watch'))
  await band.press({ key: 'stop' })
  expect(w.aborted).toEqual(['main-1'])
  expect(w.toasts.at(-1)).toBe('Loop stopped.')

  await $.turn.complete(turnEnds('aborted'))
  await clock.advance(120 * 60_000)
  expect(w.submitted).toEqual(['watch'])
  expect(await band.find({ key: 'stop' })).toBeUndefined()
  await band.unmount()
})

test('Stop while waiting cancels the timer', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const clock = mock.clock(on)
  await $.session.start(START)
  const band = await setup($, 'm60')

  await $.prompt.submit(personSays('nightly'))
  await $.turn.complete(turnEnds())
  await band.press({ key: 'stop' })
  await clock.advance(3 * 60 * 60_000)

  expect(w.submitted).toEqual(['nightly'])
  expect(w.aborted).toEqual([])
  await band.unmount()
})

test('an error stops the loop', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const clock = mock.clock(on)
  await $.session.start(START)
  const band = await setup($, 'x3')

  await $.prompt.submit(personSays('go'))
  await $.turn.complete(turnEnds('error'))
  await clock.advance(60 * 60_000)

  expect(w.submitted).toEqual(['go'])
  expect(w.toasts.at(-1)).toBe('Loop stopped: the turn ended with an error.')
  await band.unmount()
})

test("a subagent's turn end does not advance the loop, and Once never loops", async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  mock.clock(on)
  await $.session.start(START)
  const band = await setup($, 'x3')

  await $.prompt.submit(personSays('go'))
  await $.turn.complete(turnEnds('answer', 'sub-1'))
  expect(w.submitted).toEqual(['go'])
  await band.press({ key: 'stop' })
  await band.press({ key: 'repeat-once' })
  await $.prompt.submit(personSays('again'))
  await $.turn.complete(turnEnds())
  expect(w.submitted).toEqual(['go', 'again'])
  await band.unmount()
})
