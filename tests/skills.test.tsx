import { expect, mock, test } from 'claude-code/testing'

import { PINS_PATH } from '../src/skills'
import { PANE, START, agentFile, world } from './world'

const SKILLS = [
  { name: 'release-notes', description: 'Write release notes', source: 'user' as const },
  { name: 'pdf', description: 'Read and fill PDF forms', source: 'plugin' as const, plugin: 'document-skills' },
]

test('the Skills tab lists skills, and Run sends the skill with the note as the person\'s prompt', async ($, on) => {
  const w = world(on)
  w.commands = SKILLS
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-skills' })
  expect(await ui.find({ type: 'Text', text: 'Yours · 1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'document-skills · 1' })).toBeDefined()

  await ui.input({ key: 'skills-search', text: 'pdf' })
  expect(await ui.find({ key: 'open-Yours-release-notes' })).toBeUndefined()

  await ui.press({ key: 'open-document-skills-document-skills:pdf' })
  await ui.input({ key: 'note-document-skills:pdf', text: 'invoice.pdf' })
  await ui.press({ key: 'run-document-skills:pdf' })
  expect(w.ran).toEqual(['/document-skills:pdf invoice.pdf'])
  expect(w.submitted).toEqual([])
  await ui.unmount()
})

test('pins are written to the project and come back after a reload', async ($, on) => {
  const w = world(on)
  w.commands = SKILLS
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'tab-skills' })
  await ui.press({ key: 'pin-Yours-release-notes' })
  expect(JSON.parse(w.files.get(PINS_PATH)!)).toEqual(['release-notes'])
  expect(await ui.find({ type: 'Text', text: 'Pinned · 1' })).toBeDefined()
  await ui.unmount()
})

test('a pins file already in the project shows as Pinned', async ($, on) => {
  const w = world(on, { [PINS_PATH]: '["document-skills:pdf"]' })
  w.commands = SKILLS
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'tab-skills' })
  expect(await ui.find({ key: 'open-Pinned-document-skills:pdf' })).toBeDefined()
  await ui.unmount()
})

test('Add to agent appends the skill to the active agent\'s file', async ($, on) => {
  const w = world(on, { '.claude/agents/fixer.md': agentFile('fixer') })
  w.commands = SKILLS
  mock.clock(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-skills' })
  await ui.press({ key: 'open-Yours-release-notes' })
  await ui.press({ key: 'add-release-notes' })
  expect(w.toasts).toContain('Use an agent first, then add the skill to it.')

  await ui.press({ key: 'tab-deck' })
  await ui.press({ key: 'use-fixer' })
  await ui.press({ key: 'tab-skills' })
  await ui.press({ key: 'add-release-notes' })
  expect(w.files.get('.claude/agents/fixer.md')).toContain('release-notes')
  await ui.unmount()
})
