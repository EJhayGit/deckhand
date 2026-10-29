// The Skills tab's list: installed skills from `$.command.list()`, grouped
// and searched. Pure: no `$`.

// The part of `CommandInfo` this needs, so tests build lists by hand.
export type CommandEntry = { name: string; description: string; source: 'builtin' | 'plugin' | 'user' | 'mcp'; plugin?: string }

export type Skill = { id: string; name: string; description: string; group: string }
export type SkillGroup = { name: string; skills: Skill[] }

export const PINNED = 'Pinned'
export const YOURS = 'Yours'
export const PINS_PATH = '.claude/deckhand/skills.json'
const LONG = 100

// Built-in and MCP commands aren't skills, and Deckhand's own `/deck` isn't one either.
export function skillsOf(commands: readonly CommandEntry[]): Skill[] {
  return commands
    .filter(c => (c.source === 'user' || c.source === 'plugin') && c.plugin !== 'deckhand')
    .map(c => ({
      id: slashName(c),
      name: c.name,
      description: firstLine(c.description),
      group: c.source === 'user' ? YOURS : (c.plugin ?? c.name.split(':')[0] ?? 'Plugin'),
    }))
}

// What the person types after the slash: `plugin:skill` for a plugin's.
export function slashName(c: Pick<CommandEntry, 'name' | 'plugin'>): string {
  return c.plugin && !c.name.includes(':') ? `${c.plugin}:${c.name}` : c.name
}

// The first line, without wrapping quotes, cut to fit one row.
export function firstLine(text: string | undefined): string {
  const line = (text ?? '').trim().split(/\r?\n/)[0]!.trim().replace(/^(["'])(.*)\1$/, '$2').trim()

  return line.length > LONG ? `${line.slice(0, LONG - 1).trimEnd()}…` : line
}

export function searchSkills(skills: readonly Skill[], query: string): Skill[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)

  return skills.filter(s => words.every(w => `${s.id} ${s.description}`.toLowerCase().includes(w)))
}

// Pinned first (in pin order), then Yours, then each plugin by name.
export function groupSkills(skills: readonly Skill[], pinned: readonly string[]): SkillGroup[] {
  const pins = pinned.map(id => skills.find(s => s.id === id)).filter((s): s is Skill => s !== undefined)
  const names = [...new Set(skills.map(s => s.group))].sort((a, b) => (a === YOURS ? -1 : b === YOURS ? 1 : a.localeCompare(b)))
  const groups = names.map(name => ({ name, skills: skills.filter(s => s.group === name).sort((a, b) => a.name.localeCompare(b.name)) }))

  return [...(pins.length ? [{ name: PINNED, skills: pins }] : []), ...groups]
}

// The pins file's list, or none when it is missing or not a list of names.
export function parsePins(text: string | undefined): string[] {
  try {
    const value: unknown = JSON.parse(text ?? '[]')
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}
