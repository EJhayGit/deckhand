import { expect, mock, test } from 'claude-code/testing'

import { modelName } from '../src/models'
import { clockText, costOf, newRun, tokensText, totals } from '../src/runs'
import { PANE, SURFACES, START, turnEnds, world } from './world'

const STEP = { turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'low', messageCount: 1 } as const
const USAGE = { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 28000, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' }

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _ of stream) {
    // the step's pieces
  }
}

test('pure: cost, tokens, time and model names', () => {
  // 1k input at $2, 2k output at $10, 28k cache reads at $0.20 per million.
  const micro = (n: number) => Math.round(n * 1e6)
  expect(micro(costOf('claude-sonnet-5-5', USAGE))).toBe(27_600)
  expect(micro(costOf('opus', { ...USAGE, cache_read_input_tokens: 0 }))).toBe(44_000)
  expect(costOf('local:llama3.2', USAGE)).toBe(0)
  expect(clockText(17_000)).toBe('0:17')
  expect(clockText(61_000)).toBe('1:01')
  expect(tokensText(31_400)).toBe('31k')
  expect(tokensText(1_250_000)).toBe('1.3M')
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('sonnet')).toBe('Sonnet 5.5')
  const a = { ...newRun({ agentId: 'a', title: 'A', name: 'a', model: 'm' }, 1000), cost: 0.1, tokens: 10, endedAt: 5000 }
  const b = { ...newRun({ agentId: 'b', title: 'B', name: 'b', model: 'm' }, 2000), cost: 0.2, tokens: 20 }
  expect(totals([a, b], 9000)).toEqual({ cost: 0.30000000000000004, tokens: 30, ms: 8000 })
})

test('a spawned agent shows in Runs with its usage, steps, time and end', async ($, on) => {
  const w = world(on)
  const clock = mock.clock(on)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
  await $.session.start(START)

  await $.agent.spawn({ prompt: 'Review it.', subagentType: 'deckhand:reviewer', description: 'Review the whole kit' } as never)
  expect(w.spawned).toHaveLength(1)
  await drain($.turn.step({ ...STEP, agentId: 'a1' }))
  await $.tool.call({ tool: 'mcp__deckhand__deck_progress', done: 2, total: 3, agentId: 'a1' } as never)
  await clock.advance(17_000)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-runs' })
    expect(await ui.find({ type: 'Text', text: 'Review the whole kit' })).toBeDefined()
    expect((await ui.find({ key: 'runs-group-Running' }))?.text).toBe('▾ Running · 1')
    expect(await ui.find({ type: 'Text', text: '2/3' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'ctx 3% · 31k ≈$0.03 0:17' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'careful' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Sonnet 5.5 · high' })).toBeDefined()
    expect((await ui.find({ key: 'tile-Tokens' }))?.text).toBe('Tokens31k')
    await ui.unmount()
  }

  await $.turn.complete(turnEnds('answer', 'a1'))
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'run-a1' }))?.text).toContain('✓')
  expect((await ui.find({ key: 'run-a1' }))?.text).toContain('0:17')
  await ui.press({ key: 'clear-runs' })
  expect(await ui.find({ type: 'Text', text: 'Review the whole kit' })).toBeUndefined()
  await ui.unmount()
})

test('an agent that ends in an error shows as failed', async ($, on) => {
  world(on)
  mock.clock(on)
  await $.session.start(START)
  await $.agent.spawn({ prompt: 'x', subagentType: 'Explore', description: 'Look around' } as never)
  await $.turn.complete(turnEnds('error', 'a1'))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-runs' })
  expect((await ui.find({ key: 'run-a1' }))?.text).toContain('✕')
  expect((await ui.find({ key: 'runs-group-Finished' }))?.text).toBe('▾ Finished · 1')
  await ui.unmount()
})
