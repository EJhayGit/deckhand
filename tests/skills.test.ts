import { expect, test } from 'claude-code/testing'

import { PINNED, YOURS, firstLine, groupSkills, parsePins, searchSkills, skillsOf, slashName } from '../src/skills'
import type { CommandEntry } from '../src/skills'

const COMMANDS: CommandEntry[] = [
  { name: 'compact', description: 'Clear history', source: 'builtin' },
  { name: 'deck', description: 'Deckhand', source: 'plugin', plugin: 'deckhand' },
  { name: 'github:issue', description: 'An MCP prompt', source: 'mcp' },
  { name: 'release-notes', description: 'Write release notes\nfrom the git log.', source: 'user' },
  { name: 'pdf', description: '"Read and fill PDF forms"', source: 'plugin', plugin: 'document-skills' },
  { name: 'document-skills:xlsx', description: '', source: 'plugin', plugin: 'document-skills' },
  { name: 'frontend-design', description: 'Bold UI', source: 'plugin', plugin: 'frontend-design' },
]

test('only user and plugin skills are listed, Deckhand\'s own command left out', () => {
  expect(skillsOf(COMMANDS).map(s => s.id)).toEqual(['release-notes', 'document-skills:pdf', 'document-skills:xlsx', 'frontend-design:frontend-design'])
})

test('a plugin skill runs by its plugin:skill name, once', () => {
  expect(slashName({ name: 'pdf', plugin: 'document-skills' })).toBe('document-skills:pdf')
  expect(slashName({ name: 'document-skills:pdf', plugin: 'document-skills' })).toBe('document-skills:pdf')
  expect(slashName({ name: 'mine' })).toBe('mine')
})

test('descriptions: first line, quotes off, long ones cut, missing ones empty', () => {
  expect(firstLine('Write release notes\nfrom the git log.')).toBe('Write release notes')
  expect(firstLine('"Quoted"')).toBe('Quoted')
  expect(firstLine("'Single'")).toBe('Single')
  expect(firstLine('"Odd quote')).toBe('"Odd quote')
  expect(firstLine(undefined)).toBe('')
  const long = firstLine('x'.repeat(300))
  expect(long.length).toBe(100)
  expect(long.endsWith('…')).toBe(true)
})

test('groups: Pinned, then Yours, then plugins by name', () => {
  const groups = groupSkills(skillsOf(COMMANDS), ['frontend-design:frontend-design', 'gone'])

  expect(groups.map(g => g.name)).toEqual([PINNED, YOURS, 'document-skills', 'frontend-design'])
  expect(groups[0]!.skills.map(s => s.id)).toEqual(['frontend-design:frontend-design'])
  expect(groupSkills(skillsOf(COMMANDS), [])[0]!.name).toBe(YOURS)
})

test('search matches every word against name or description', () => {
  const all = skillsOf(COMMANDS)

  expect(searchSkills(all, 'PDF').map(s => s.id)).toEqual(['document-skills:pdf'])
  expect(searchSkills(all, 'release git').map(s => s.id)).toEqual([])
  expect(searchSkills(all, 'release notes').map(s => s.id)).toEqual(['release-notes'])
  expect(searchSkills(all, '  ')).toHaveLength(4)
})

test('the pins file', () => {
  expect(parsePins('["a", 2, "b"]')).toEqual(['a', 'b'])
  expect(parsePins('{oops')).toEqual([])
  expect(parsePins(undefined)).toEqual([])
})
