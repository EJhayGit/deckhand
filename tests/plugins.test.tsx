import { expect, test } from 'claude-code/testing'

import { withPlugins } from '../src/plugins'
import { PANE, START, world } from './world'

test('pure: withPlugins turns plugins on, adds known marketplaces, and keeps the rest', () => {
  const old = JSON.stringify({ model: 'opus', enabledPlugins: { 'a@b': true }, extraKnownMarketplaces: { trailofbits: { source: { source: 'directory', path: '/x' } } } })
  const next = JSON.parse(withPlugins(old, ['taste-skill@taste-skill', 'fp-check@trailofbits', 'mine@unknown'])!)

  expect(next.model).toBe('opus')
  expect(next.enabledPlugins).toEqual({ 'a@b': true, 'taste-skill@taste-skill': true, 'fp-check@trailofbits': true, 'mine@unknown': true })
  expect(next.extraKnownMarketplaces['taste-skill']).toEqual({ source: { source: 'github', repo: 'Leonxlnx/taste-skill' } })
  expect(next.extraKnownMarketplaces.trailofbits).toEqual({ source: { source: 'directory', path: '/x' } })
  expect(next.extraKnownMarketplaces.unknown).toBeUndefined()
  expect(withPlugins('{ broken', ['x@y'])).toBeUndefined()
  expect(withPlugins('[]', ['x@y'])).toBeUndefined()
  expect(JSON.parse(withPlugins(undefined, ['x@y'])!).enabledPlugins).toEqual({ 'x@y': true })
})

test('Set up writes project settings only after Add, and the note goes away', async ($, on) => {
  const w = world(on, { '.claude/settings.json': '{ "model": "opus" }' })
  w.enabledPlugins = { 'frontend-design@claude-plugins-official': true }
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: 'needs taste-skill' })).toBeDefined()
  await ui.press({ key: 'setup-frontend-designer' })
  expect(w.files.get('.claude/settings.json')).toBe('{ "model": "opus" }')
  await ui.press({ key: 'confirm-setup-frontend-designer' })

  const saved = JSON.parse(w.files.get('.claude/settings.json')!)
  expect(saved.model).toBe('opus')
  expect(saved.enabledPlugins).toEqual({ 'taste-skill@taste-skill': true })
  expect([...w.files.keys()].filter(k => !k.startsWith('.claude/settings.json'))).toEqual([])
  expect(w.toasts.at(-1)).toContain('Restart Claude Code')
  expect(await ui.find({ key: 'setup-frontend-designer' })).toBeUndefined()
  await ui.unmount()
})

test('a broken settings file is left alone', async ($, on) => {
  const w = world(on, { '.claude/settings.json': '{ nope' })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.press({ key: 'setup-security-auditor' })
  await ui.press({ key: 'confirm-setup-security-auditor' })

  expect(w.files.get('.claude/settings.json')).toBe('{ nope')
  expect(w.toasts.at(-1)).toContain("isn't valid JSON")
  await ui.unmount()
})
