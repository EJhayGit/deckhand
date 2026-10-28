import { expect, test } from 'claude-code/testing'

import { parseAgent, serializeAgent } from '../src/agents/format'
import { STARTERS } from '../src/agents/starters'

const FIXER = `---
name: fixer
description: Fixes the bug you describe with the smallest change.
model: sonnet            # alias, full id, or a gateway model name (M7)
effort: medium
tools: [Read, Grep, Glob, Edit, Write, Bash]
disallowedTools: [WebFetch, WebSearch]
color: orange
mood: cheerful
deckhand:
  icon: "🛠️"             # emoji, or a file under .claude/deckhand/icons/
  limits: { edit: true, run: true, internet: false }
  gateway: null          # M7: name of a configured gateway, or null
  future: kept
---
Fix the bug I describe with the smallest change. Explain what you changed in
two sentences.
`

test('parses the plan example', () => {
  const { agent } = parseAgent(FIXER)

  expect(agent.name).toBe('fixer')
  expect(agent.model).toBe('sonnet')
  expect(agent.effort).toBe('medium')
  expect(agent.tools).toEqual(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'])
  expect(agent.icon).toBe('🛠️')
  expect(agent.limits).toEqual({ edit: true, run: true, internet: false })
  expect(agent.gateway).toBe(null)
  expect(agent.body.startsWith('Fix the bug')).toBe(true)
})

test('an unchanged agent round-trips byte for byte, unknown keys and comments too', () => {
  const doc = parseAgent(FIXER)

  expect(serializeAgent(doc.agent, doc)).toBe(FIXER)
})

test('CRLF files round-trip', () => {
  const crlf = FIXER.replaceAll('\n', '\r\n')
  const doc = parseAgent(crlf)

  expect(serializeAgent(doc.agent, doc)).toBe(crlf)
})

test('a change rewrites only that key', () => {
  const doc = parseAgent(FIXER)
  const text = serializeAgent({ ...doc.agent, effort: 'high', limits: { ...doc.agent.limits, internet: true } }, doc)

  expect(text).toContain('effort: high\n')
  expect(text).toContain('limits: { edit: true, run: true, internet: true }')
  expect(text).toContain('model: sonnet            # alias')
  expect(text).toContain('mood: cheerful')
  expect(text).toContain('  future: kept')
  expect(text.endsWith('two sentences.\n')).toBe(true)
})

test('hand edits in block style are read and survive a save', () => {
  const hand = `---
name: hand
description: 'It''s hand made'
tools:
  - Read
  - Grep
deckhand:
  limits:
    edit: false
    run: true
    internet: false
---
Body
`
  const doc = parseAgent(hand)

  expect(doc.agent.description).toBe("It's hand made")
  expect(doc.agent.tools).toEqual(['Read', 'Grep'])
  expect(doc.agent.limits.run).toBe(true)
  expect(serializeAgent(doc.agent, doc)).toBe(hand)
})

test('a new agent serializes and parses back', () => {
  for (const starter of STARTERS) {
    const agent = { ...starter.agent, name: starter.id }
    const back = parseAgent(serializeAgent(agent)).agent

    expect(back.name).toBe(agent.name)
    expect(back.model).toBe(agent.model)
    expect(back.effort).toBe(agent.effort)
    expect(back.icon).toBe(agent.icon)
    expect(back.limits).toEqual(agent.limits)
    expect(back.body).toBe(agent.body)
    expect(back.description).toBe(agent.description)
  }
})

test('a plain Claude Code agent file with no deckhand block reads as read only', () => {
  const { agent } = parseAgent('---\nname: plain\ndescription: x\n---\nhi\n')

  expect(agent.limits).toEqual({ edit: false, run: false, internet: false })
})
