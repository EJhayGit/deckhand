// MUST PASS: a limit that leaks is the worst bug this mod can have.
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PANE, START, agentFile, world } from './world'

const CALLS = [
  { limit: 'run', call: { tool: 'Bash', command: 'npm install' } },
  { limit: 'run', call: { tool: 'PowerShell', command: 'Remove-Item x' } },
  { limit: 'edit', call: { tool: 'Edit', file_path: 'src/a.ts', old_string: 'a', new_string: 'b' } },
  { limit: 'edit', call: { tool: 'Write', file_path: 'src/b.ts', content: 'x' } },
  { limit: 'internet', call: { tool: 'WebFetch', url: 'https://example.com', prompt: 'read' } },
  { limit: 'internet', call: { tool: 'WebSearch', query: 'deckhand' } },
] as const

async function useAgent($: Engine, name: string) {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: `use-${name}` })
  await ui.unmount()
}

for (const { limit, call } of CALLS) {
  test(`${call.tool} is blocked while ${limit} is off, with a toast and a transcript note`, async ($, on) => {
    const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
    const ran: string[] = []
    on('tool.call', (_, e) => {
      ran.push(e.tool)
      return { result: {} }
    })
    await $.session.start(START)
    await useAgent($, 'reviewer')

    const result = await $.tool.call(call as never)

    expect(ran).toEqual([])
    expect(JSON.stringify(result)).toContain('Blocked: reviewer')
    expect(w.toasts.at(-1)).toContain(`Blocked: reviewer tried to`)
    expect(w.logs.at(-1)).toBe(w.toasts.at(-1))
  })

  test(`${call.tool} runs while ${limit} is on`, async ($, on) => {
    const all = '{ edit: true, run: true, internet: true }'
    world(on, { '.claude/agents/fixer.md': agentFile('fixer', all) })
    const ran: string[] = []
    on('tool.call', (_, e) => {
      ran.push(e.tool)
      return { result: {} }
    })
    await $.session.start(START)
    await useAgent($, 'fixer')

    await $.tool.call(call as never)

    expect(ran).toEqual([call.tool])
  })
}

test('the blocked note names the command and the limit', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  on('tool.call', () => ({ result: {} }))
  await $.session.start(START)
  await useAgent($, 'reviewer')

  await $.tool.call({ tool: 'Bash', command: 'npm install' })

  expect(w.toasts.at(-1)).toBe('Blocked: reviewer tried to run `npm install`, but Run commands is off for this agent.')
})

test('a subagent of the active agent is held to the same limits', async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const ran: string[] = []
  on('tool.call', (_, e) => {
    ran.push(e.tool)
    return { result: {} }
  })
  await $.session.start(START)
  await useAgent($, 'reviewer')

  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' } as never)

  expect(ran).toEqual([])
})

test('read tools always run, and with no agent nothing is blocked', async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const ran: string[] = []
  on('tool.call', (_, e) => {
    ran.push(e.tool)
    return { result: {} }
  })
  await $.session.start(START)

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await useAgent($, 'reviewer')
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' })

  expect(ran).toEqual(['Bash', 'Read'])
})

test('a chip change applies at once: turning Run commands on lets Bash through', async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const ran: string[] = []
  on('tool.call', (_, e) => {
    ran.push(e.tool)
    return { result: {} }
  })
  await $.session.start(START)
  await useAgent($, 'reviewer')
  const band = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await band.press({ key: 'can-run' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await band.press({ key: 'can-run' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(ran).toEqual(['Bash'])
  await band.unmount()
})

test('the guard fails closed: when it cannot read the active agent, the call is blocked', async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  const ran: string[] = []
  on('tool.call', (_, e) => {
    ran.push(e.tool)
    return { result: {} }
  })
  let isBroken = false
  // Broken state: the deck reads back as a number, so the guard throws.
  on('state.get', async (_, e, next) => {
    const read = await next(e)
    return isBroken && 'value' in read && read.value ? { ...read, value: { ...read.value, value: 42 } } : read
  })
  await $.session.start(START)
  await useAgent($, 'reviewer')
  isBroken = true

  const result = await $.tool.call({ tool: 'Read', file_path: 'a.ts' })

  expect(ran).toEqual([])
  expect(JSON.stringify(result)).toContain('limit check failed')
})
