import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { BAND, PANE, START, agentFile, world } from './world'

const STEP = { turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'low', messageCount: 1 } as const
const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const

async function useAgent($: Engine, name: string) {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: `use-${name}` })
  await ui.unmount()
}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _ of stream) {
    // the step's pieces; the test reads what the engine was asked
  }
}

function engineSteps(on: On) {
  const seen: { model: string; effort?: unknown }[] = []
  on('turn.step', async function* (_, e) {
    seen.push({ model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  return seen
}

test('model and effort are rewritten for the main loop only', async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agentFile('reviewer').replace('model: haiku', 'model: haiku\neffort: high') })
  const seen = engineSteps(on)
  await $.session.start(START)

  await drain($.turn.step(STEP))
  await useAgent($, 'reviewer')
  await drain($.turn.step(STEP))
  await drain($.turn.step({ ...STEP, agentId: 'sub1' }))

  expect(seen).toEqual([
    { model: 'claude-sonnet-5-5', effort: 'low' },
    { model: 'claude-haiku-5-5', effort: 'high' },
    { model: 'claude-sonnet-5-5', effort: 'low' },
  ])
})

test('the Default model chip leaves the session model alone', async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const seen = engineSteps(on)
  await $.session.start(START)
  await useAgent($, 'reviewer')
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })

  await band.press({ key: 'model-default' })
  await band.press({ key: 'effort-max' })
  await drain($.turn.step(STEP))

  expect(seen).toEqual([{ model: 'claude-sonnet-5-5', effort: 'max' }])
  await band.unmount()
})

test("the agent's instructions join the system prompt while it is active", async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }] }))
  await $.session.start(START)

  const before = await $.prompt.compose(COMPOSE)
  await useAgent($, 'reviewer')
  const after = await $.prompt.compose(COMPOSE)

  expect(before.sections.map(s => s.id)).toEqual(['intro'])
  expect(after.sections.map(s => s.id)).toEqual(['intro', 'deckhand:agent'])
  expect(after.sections[1]?.text).toContain('Do reviewer things.')
  expect(after.sections[1]?.scope).toBe('session')
})

test('the band shows only while an agent is active, and its chips switch on and off', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  await $.session.start(START)

  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({ ...BAND, surface })
    expect(await idle.find({ type: 'Text', text: 'engine band' })).toBeDefined()
    await idle.unmount()
  }

  await useAgent($, 'reviewer')
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    const isOn = async (key: string) => (await band.find({ key }))?.props.variant === 'primary'
    expect((await band.find({ key: 'model-opus' }))?.text).toBe('Opus 5.5')
    await band.press({ key: 'model-opus' })
    await band.press({ key: 'effort-high' })
    expect([await isOn('model-opus'), await isOn('model-haiku'), await isOn('effort-high'), await isOn('can-edit')]).toEqual([true, false, true, false])
    await band.press({ key: 'can-edit' })
    expect(await isOn('can-edit')).toBe(true)
    await band.press({ key: 'can-edit' })
    await band.press({ key: 'effort-high' })
    expect(await isOn('effort-high')).toBe(false)
    await band.unmount()
  }
  // The status line stays clear: the band shows the agent.
  expect(w.status.every(s => s === undefined)).toBe(true)
})

test('Save to agent appears when chips differ, and writes them to the file', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  await $.session.start(START)
  await useAgent($, 'reviewer')
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await band.find({ key: 'save-chips' })).toBeUndefined()
  await band.press({ key: 'model-sonnet' })
  await band.press({ key: 'can-run' })
  await band.press({ key: 'save-chips' })

  const text = w.files.get('.claude/agents/reviewer.md') ?? ''
  expect(text).toContain('model: sonnet')
  expect(text).toContain('limits: { edit: false, run: true, internet: false }')
  expect(text).toContain('Do reviewer things.')
  expect(await band.find({ key: 'save-chips' })).toBeUndefined()
  await band.unmount()
})
