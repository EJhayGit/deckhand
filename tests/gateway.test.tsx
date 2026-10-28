import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { codexArgv, gatewayOptions, ollamaAnswer, ollamaRequest } from '../src/gateway'
import { BAND, PANE, START, agentFile, world } from './world'

const STEP = { turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1 } as const

async function use($: Engine, name: string) {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: `use-${name}` })
  await ui.unmount()
}

async function ask($: Engine, text: string) {
  await $.turn.start({ text, turnId: 't1' })
  const chunks: unknown[] = []
  const stream = $.turn.step(STEP)
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

test('pure: options fall back to defaults, and requests are shaped for Ollama', () => {
  expect(gatewayOptions({ localUrl: 'http://box:11434/' })).toEqual({ localUrl: 'http://box:11434', localModel: 'llama3.2', codexCommand: 'codex' })
  expect(JSON.parse(ollamaRequest('qwen', 'Be brief.', [{ role: 'user', content: 'hi' }]))).toEqual({
    model: 'qwen',
    messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'hi' }],
    stream: false,
  })
  expect(ollamaAnswer('{"message":{"content":"hello"}}')).toBe('hello')
  expect(ollamaAnswer('nope')).toBe(undefined)
})

test('pure: Codex is read only unless Edit files is on', () => {
  expect(codexArgv('codex', 'go', { edit: false, run: true, internet: false })).toEqual(['codex', 'exec', '--skip-git-repo-check', '--sandbox', 'read-only', 'go'])
  expect(codexArgv('codex', 'go', { edit: true, run: false, internet: false })[4]).toBe('workspace-write')
})

test('a Local agent is answered by Ollama, keeps its own history, and never reaches Claude', async ($, on) => {
  const w = world(on, { '.claude/agents/llama.md': agentFile('llama', undefined, 'local:qwen2.5') })
  let claude = 0
  on('turn.step', async function* (_, e) {
    claude++
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await $.session.start(START)
  await use($, 'llama')

  w.reply = { ok: true, status: 200, text: '{"message":{"content":"Hi there"}}' }
  const chunks = await ask($, 'hello')
  w.reply = { ok: true, status: 200, text: '{"message":{"content":"Still here"}}' }
  await ask($, 'again')

  expect(claude).toBe(0)
  expect(chunks).toContainEqual({ kind: 'text', index: 0, text: 'Hi there' })
  expect(w.fetches[0]?.url).toBe('http://localhost:11434/api/chat')
  const second = JSON.parse(w.fetches[1]?.body ?? '{}') as { model: string; messages: { role: string; content: string }[] }
  expect(second.model).toBe('qwen2.5')
  expect(second.messages.map(m => m.content)).toEqual(['Do llama things.\n', 'hello', 'Hi there', 'again'])
})

test('the Local chip uses the configured model, and a dead server gets a plain answer', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  await $.session.start(START)
  await use($, 'reviewer')
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'model-local' })
  expect(await band.find({ type: 'Text', text: /text only/ })).toBeDefined()

  w.reply = 'refused'
  const chunks = await ask($, 'hello')

  expect(JSON.stringify(chunks)).toContain('Is Ollama running')
  expect(JSON.stringify(chunks)).toContain('llama3.2')
  await band.unmount()
})

test('a Codex agent runs codex exec in the project, read only by default', async ($, on) => {
  const w = world(on, { '.claude/agents/cx.md': agentFile('cx', undefined, 'codex') })
  await $.session.start(START)
  await use($, 'cx')
  w.stdout = 'Codex says done.'

  const chunks = await ask($, 'tidy the README')

  expect(w.runs.at(-1)).toEqual(['codex', 'exec', '--skip-git-repo-check', '--sandbox', 'read-only', 'Do cx things.\n\nTask: tidy the README'])
  expect(chunks).toContainEqual({ kind: 'text', index: 0, text: 'Codex says done.' })
})

test('a subagent turn is never sent to the gateway', async ($, on) => {
  const w = world(on, { '.claude/agents/llama.md': agentFile('llama', undefined, 'local') })
  let claude = 0
  on('turn.step', async function* (_, e) {
    claude++
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await $.session.start(START)
  await use($, 'llama')

  for await (const _ of $.turn.step({ ...STEP, agentId: 'sub' })) {
    // drained
  }

  expect(claude).toBe(1)
  expect(w.fetches).toEqual([])
})
