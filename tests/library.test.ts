import { expect, test } from 'claude-code/testing'

import { world } from './world'

const FILE = '---\nname: fixer\ndescription: Fixes bugs.\nmodel: sonnet\ndeckhand:\n  limits: { edit: true, run: true, internet: false }\n---\nFix it.\n'
const SHARED = '---\nname: reviewer\ndescription: Reviews.\nmodel: haiku\n---\nReview.\n'

test('loads project files and library agents, and registers all but the project ones', async ($, on) => {
  const w = world(on, { '.claude/agents/fixer.md': FILE }, { library: { reviewer: SHARED } })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // The library reviewer replaces the built-in of that name; project files load in Claude Code itself.
  expect(w.agents.filter(a => a.name === 'reviewer')).toHaveLength(1)
  expect(w.agents.some(a => a.name === 'fixer')).toBe(false)
  expect(w.agents.some(a => a.name === 'security-auditor')).toBe(true)
  expect(w.agents[0]?.disallowedTools).toEqual(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'WebFetch', 'WebSearch'])
  expect(w.agents[0]?.model).toBe('haiku')
})

