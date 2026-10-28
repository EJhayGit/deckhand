import { expect, test } from 'claude-code/testing'

import { parseAgent } from '../src/agents/format'
import { agentText } from '../src/agents/library'
import { BUILTINS, GROUPS, STARTERS } from '../src/agents/starters'
import { LIMIT_TOOLS } from '../src/limits'
import { mascotSvg } from '../src/ui/mascot'

test('built-in names are unique, valid, and in a known group', () => {
  const ids = STARTERS.map(s => s.id)

  expect(new Set(ids).size).toBe(ids.length)
  for (const b of BUILTINS) {
    expect(/^[a-z][a-z0-9-]*$/.test(b.id)).toBe(true)
    expect((GROUPS as readonly string[]).includes(b.group)).toBe(true)
    expect(b.agent.description.length).toBeGreaterThan(20)
    expect(b.agent.body.length).toBeGreaterThan(200)
  }
})

test('each built-in file parses back to itself, with its limits applied to its tools', () => {
  for (const b of BUILTINS) {
    const agent = { ...b.agent, name: b.id }
    const back = parseAgent(agentText(agent)).agent

    expect(back.body).toBe(agent.body)
    expect(back.limits).toEqual(agent.limits)
    expect(back.skills).toEqual(agent.skills)
    expect(back.plugins).toEqual(agent.plugins)
    for (const limit of ['edit', 'run', 'internet'] as const) {
      for (const tool of LIMIT_TOOLS[limit]) {
        expect(back.disallowedTools?.includes(tool)).toBe(!agent.limits[limit])
      }
    }
  }
})

test('every mascot draws on its 14 x 12 grid', () => {
  for (const hat of ['cap', 'hardhat', 'headphones', 'beret', 'antenna', 'crown', 'none'] as const) {
    const svg = mascotSvg('#f76b15', hat)
    const xs = [...svg.matchAll(/x="(\d+)" y="(\d+)"/g)].map(m => [Number(m[1]), Number(m[2])])
    expect(xs.every(([x, y]) => x! < 14 && y! < 12)).toBe(true)
    expect(svg).toContain('fill="#f76b15"')
  }
})

test('read-only built-ins say they change nothing', () => {
  for (const b of BUILTINS.filter(b => !b.agent.limits.edit && !b.agent.limits.run)) {
    expect(b.agent.body.toLowerCase()).toMatch(/change\s+nothing|write\s+no\s+code/)
  }
})
