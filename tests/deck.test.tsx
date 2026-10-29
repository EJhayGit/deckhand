import { expect, test } from 'claude-code/testing'

import { PANE, SURFACES, world } from './world'

const agent = (name: string, limits = '{ edit: false, run: false, internet: false }') =>
  `---\nname: ${name}\ndescription: The ${name}.\nmodel: haiku\ndeckhand:\n  icon: "🔍"\n  limits: ${limits}\n---\nDo ${name} things.\n`

const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const

test('the deck opens at session start', async ($, on) => {
  const w = world(on)

  await $.session.start(START)

  expect(w.opened).toEqual(['deck'])
})

test('the header shows the version the plugin manifest names', async ($, on) => {
  world(on, { '.claude-plugin/plugin.json': '{ "name": "deckhand", "version": "9.8.7" }' })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: 'Deck v9.8.7' })).toBeDefined()
  await ui.unmount()
})

test('built-in agents show in a fresh project, and register hidden from the model', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Text', text: 'security-auditor' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'website-reviewer' })).toBeDefined()
    await ui.unmount()
  }
  expect(w.agents.some(a => a.name === 'frontend-designer')).toBe(true)
  expect(await $.agent.offer({ agent: 'deckhand:reviewer', description: '', source: 'plugin', provider: { plugin: 'deckhand', tier: 'user' } } as never)).toEqual({ isOffered: false })
})

test('a project file overrides the built-in of the same name', async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agent('reviewer') })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /The reviewer\./ })).toBeDefined()
  expect(await ui.find({ key: 'more-reviewer' })).toBeDefined()
  await ui.unmount()
})

test('cards show, and Use marks the active card, on terminal and desktop', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agent('reviewer'), '.claude/agents/fixer.md': agent('fixer', '{ edit: true, run: true, internet: false }') })
  await $.session.start(START)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Text', text: 'reviewer' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\[read only\]/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\[edits files\] \[runs commands\]/ })).toBeDefined()
    expect((await ui.find({ key: 'use-reviewer' }))?.text).toBe('Use')

    await ui.press({ key: 'use-reviewer' })
    expect((await ui.find({ key: 'use-reviewer' }))?.text).toBe('In use')
    expect((await ui.find({ key: 'use-fixer' }))?.text).toBe('Use')

    await ui.press({ key: 'none' })
    expect((await ui.find({ key: 'use-reviewer' }))?.text).toBe('Use')
    expect((await ui.find({ key: 'use-fixer' }))?.text).toBe('Use')
    await ui.unmount()
  }
  expect(w.status.every(s => s === undefined)).toBe(true)
})

test('Duplicate writes a copy, and Delete asks first', async ($, on) => {
  const w = world(on, { '.claude/agents/reviewer.md': agent('reviewer') })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'more-reviewer' })
  await ui.press({ key: 'dup-reviewer' })
  expect(w.files.get('.claude/agents/reviewer-copy.md')).toContain('name: reviewer-copy')
  expect(w.files.get('.claude/agents/reviewer-copy.md')).toContain('Do reviewer things.')
  expect(await ui.find({ type: 'Text', text: 'reviewer-copy' })).toBeDefined()

  await ui.press({ key: 'more-reviewer-copy' })
  await ui.press({ key: 'del-reviewer-copy' })
  expect(w.files.has('.claude/agents/reviewer-copy.md')).toBe(true)
  await ui.press({ key: 'confirm-del-reviewer-copy' })
  expect(w.files.has('.claude/agents/reviewer-copy.md')).toBe(false)
  expect(await ui.find({ type: 'Text', text: 'reviewer-copy' })).toBeUndefined()
  await ui.unmount()
})

test('Save to my library keeps a copy in the store', async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agent('reviewer') })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'more-reviewer' })
  await ui.press({ key: 'lib-reviewer' })
  expect(await ui.find({ type: 'Text', text: /\[library\]/ })).toBeUndefined()
  await ui.press({ key: 'more-reviewer' })
  expect((await ui.find({ key: 'lib-reviewer' }))?.text).toBe('Update my library')
  await ui.unmount()
})

test('Edit opens the form, and Cancel goes back', async ($, on) => {
  world(on, { '.claude/agents/reviewer.md': agent('reviewer') })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'edit-reviewer' })
  expect(await ui.find({ type: 'Text', text: 'Edit reviewer' })).toBeDefined()
  await ui.press({ key: 'cancel' })
  expect(await ui.find({ type: 'Text', text: 'Deck' })).toBeDefined()
  await ui.unmount()
})
