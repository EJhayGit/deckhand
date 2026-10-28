import { expect, test } from 'claude-code/testing'

import { parseAgent } from '../src/agents/format'
import { PANE, SURFACES, START, agentFile, world } from './world'

for (const surface of SURFACES) {
  test(`a new agent starts read only, and saves to .claude/agents (${surface})`, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    const ui = await $.ui.mount({ ...PANE, surface })

    await ui.press({ key: 'new' })
    expect((await ui.find({ key: 'fcan-edit' }))?.text).toBe('Edit files')
    await ui.input({ key: 'name', text: `scout-${surface}` })
    await ui.input({ key: 'body', text: 'Look around and report.' })
    await ui.press({ key: 'save' })

    const saved = parseAgent(w.files.get(`.claude/agents/scout-${surface}.md`) ?? '').agent
    expect(saved.limits).toEqual({ edit: false, run: false, internet: false })
    expect(saved.disallowedTools).toEqual(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'WebFetch', 'WebSearch'])
    expect(saved.body).toBe('Look around and report.')
    expect(saved.description).toBe('Look around and report.')
    expect(await ui.find({ type: 'Text', text: `scout-${surface}` })).toBeDefined()
    await ui.unmount()
  })
}

test('a starter fills the form, and the chips change it before saving', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'new-card' })
  await ui.input({ key: 'name', text: 'fixer' })
  await ui.press({ key: 'starter-fixer' })
  await ui.press({ key: 'feffort-high' })
  await ui.press({ key: 'fcan-internet' })
  await ui.press({ key: 'icon-5' })
  await ui.press({ key: 'color-green' })
  await ui.press({ key: 'save' })

  const saved = parseAgent(w.files.get('.claude/agents/fixer.md') ?? '').agent
  expect(saved.name).toBe('fixer')
  expect(saved.model).toBe('sonnet')
  expect(saved.effort).toBe('high')
  expect(saved.limits).toEqual({ edit: true, run: true, internet: true })
  expect(saved.icon).toBe('🚀')
  expect(saved.color).toBe('green')
  expect(saved.body).toContain('smallest change')
  await ui.unmount()
})

test('editing keeps unknown keys and hand-written parts of the file', async ($, on) => {
  const file = agentFile('reviewer').replace('model: haiku', 'model: haiku\nmood: calm   # mine')
  const w = world(on, { '.claude/agents/reviewer.md': file })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'edit-reviewer' })
  await ui.press({ key: 'feffort-max' })
  await ui.press({ key: 'save' })

  const text = w.files.get('.claude/agents/reviewer.md') ?? ''
  expect(text).toContain('mood: calm   # mine')
  expect(text).toContain('effort: max')
  expect(text).toContain('Do reviewer things.')
  await ui.unmount()
})

test('a bad or taken name is refused with a note', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agentFile('reviewer') })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'new' })
  await ui.input({ key: 'name', text: 'two words' })
  await ui.press({ key: 'save' })
  expect(await ui.find({ type: 'Text', text: /Give the agent a name/ })).toBeDefined()
  await ui.input({ key: 'name', text: 'reviewer' })
  await ui.press({ key: 'save' })
  expect(await ui.find({ type: 'Text', text: /already an agent called reviewer/ })).toBeDefined()
  expect(w.files.size).toBe(1)
  await ui.unmount()
})

test('instructions import from AGENTS.md, a CLAUDE.md, or an agent file', async ($, on) => {
  const w = world(on, {
    'AGENTS.md': 'Follow the house style.',
    'CLAUDE.md': 'Be brief.',
    '.claude/agents/reviewer.md': agentFile('reviewer'),
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'new' })
  await ui.input({ key: 'name', text: 'a' })
  await ui.press({ key: 'import-agents' })
  await ui.press({ key: 'save' })
  expect(parseAgent(w.files.get('.claude/agents/a.md') ?? '').agent.body).toBe('Follow the house style.')

  await ui.press({ key: 'new' })
  await ui.input({ key: 'name', text: 'b' })
  await ui.press({ key: 'import-file' })
  await ui.input({ key: 'import-path', text: '.claude/agents/reviewer.md' })
  await ui.press({ key: 'save' })
  expect(parseAgent(w.files.get('.claude/agents/b.md') ?? '').agent.body).toBe('Do reviewer things.\n')

  await ui.press({ key: 'new' })
  await ui.input({ key: 'name', text: 'c' })
  await ui.press({ key: 'import-file' })
  await ui.input({ key: 'import-path', text: 'CLAUDE.md' })
  await ui.press({ key: 'save' })
  expect(parseAgent(w.files.get('.claude/agents/c.md') ?? '').agent.body).toBe('Be brief.')
  await ui.unmount()
})

test('an uploaded SVG icon is copied to .claude/deckhand/icons and drawn on desktop', async ($, on) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>'
  const w = world(on, { 'C:/pics/fox.svg': svg })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'new' })
  await ui.input({ key: 'name', text: 'fox' })
  await ui.input({ key: 'icon-path', text: 'C:/pics/fox.svg' })
  await ui.press({ key: 'save' })

  expect(w.files.get('.claude/deckhand/icons/fox.svg')).toBe(svg)
  expect(parseAgent(w.files.get('.claude/agents/fox.md') ?? '').agent.icon).toBe('fox.svg')
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: 'F' })).toBeDefined()
  await term.unmount()
})

test('a PNG icon is wrapped in an SVG image element', async ($, on) => {
  const w = world(on, { 'C:/pics/fox.png': 'PNGDATA' })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'new' })
  await ui.input({ key: 'name', text: 'fox' })
  await ui.input({ key: 'icon-path', text: 'C:/pics/fox.png' })

  expect(w.files.get('.claude/deckhand/icons/fox.svg')).toContain(`data:image/png;base64,${btoa('PNGDATA')}`)
  await ui.unmount()
})
