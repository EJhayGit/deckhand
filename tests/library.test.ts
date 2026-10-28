import { expect, test } from 'claude-code/testing'

import { world } from './world'

const FILE = '---\nname: fixer\ndescription: Fixes bugs.\nmodel: sonnet\ndeckhand:\n  limits: { edit: true, run: true, internet: false }\n---\nFix it.\n'
const SHARED = '---\nname: reviewer\ndescription: Reviews.\nmodel: haiku\n---\nReview.\n'

test('loads project files and library agents, and registers the library-only ones', async ($, on) => {
  const w = world(on, { '.claude/agents/fixer.md': FILE }, { library: { reviewer: SHARED } })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(w.agents.map(a => a.name)).toEqual(['reviewer'])
  expect(w.agents[0]?.disallowedTools).toEqual(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'WebFetch', 'WebSearch'])
  expect(w.agents[0]?.model).toBe('haiku')
})

