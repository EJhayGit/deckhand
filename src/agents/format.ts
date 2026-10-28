// Agent Markdown files: parse and serialize, keeping unknown keys, comments
// and the body exactly as written. Pure: no `$`.

import type { Agent, Effort, Limits } from '../../types'

export type { Agent, Effort, Limits }

// One top-level frontmatter key and the lines it spans, kept verbatim.
type Entry = { key: string; lines: string[] }

export type AgentDoc = { agent: Agent; entries: Entry[]; deckhand: Entry[]; eol: string }

export const READ_ONLY: Limits = { edit: false, run: false, internet: false }
const EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max']
const TOP_KEYS = ['name', 'description', 'model', 'effort', 'tools', 'disallowedTools', 'color', 'skills'] as const
const DECK_KEYS = ['icon', 'limits', 'gateway', 'plugins'] as const

export function parseAgent(text: string): AgentDoc {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text)
  const front = match?.[1] ?? ''
  const body = match ? (match[2] ?? '') : text
  const entries = splitEntries(front.split(/\r?\n/), 0)
  const deckEntry = entries.find(e => e.key === 'deckhand')
  const deckhand = deckEntry ? splitEntries(deckEntry.lines.slice(1), indentOf(deckEntry.lines[1] ?? '  ')) : []
  const top = (key: string) => valueOf(entries.find(e => e.key === key))
  const deck = (key: string) => valueOf(deckhand.find(e => e.key === key))
  const limits = deck('limits')
  const effort = top('effort')

  const agent: Agent = {
    name: str(top('name')) ?? '',
    description: str(top('description')) ?? '',
    model: str(top('model')),
    effort: typeof effort === 'string' && EFFORTS.includes(effort) ? (effort as Effort) : undefined,
    tools: list(top('tools')),
    disallowedTools: list(top('disallowedTools')),
    color: str(top('color')),
    icon: str(deck('icon')),
    limits: {
      edit: isObj(limits) && limits.edit === true,
      run: isObj(limits) && limits.run === true,
      internet: isObj(limits) && limits.internet === true,
    },
    gateway: str(deck('gateway')) ?? null,
    skills: list(top('skills')),
    plugins: list(deck('plugins')),
    body,
  }

  return { agent, entries, deckhand, eol: text.includes('\r\n') ? '\r\n' : '\n' }
}

// Writes `agent` back over `doc` (from parseAgent), touching only changed keys.
export function serializeAgent(agent: Agent, doc?: AgentDoc): string {
  const old = doc?.agent
  const entries = [...(doc?.entries ?? [])]
  const deckhand = [...(doc?.deckhand ?? [])]

  for (const key of TOP_KEYS) {
    put(entries, key, agent[key], old?.[key], 0)
  }
  for (const key of DECK_KEYS) {
    put(deckhand, key, agent[key], old?.[key], 2)
  }

  const deckAt = entries.findIndex(e => e.key === 'deckhand')
  const head = deckAt >= 0 ? (entries[deckAt]?.lines[0] ?? 'deckhand:') : 'deckhand:'
  const deckEntry = { key: 'deckhand', lines: [head, ...deckhand.flatMap(e => e.lines)] }
  if (deckAt >= 0) {
    entries[deckAt] = deckEntry
  } else {
    entries.push(deckEntry)
  }

  const eol = doc?.eol ?? '\n'
  const front = entries.flatMap(e => e.lines).join(eol)

  return `---${eol}${front}${eol}---${eol}${agent.body}`
}

function put(entries: Entry[], key: string, value: unknown, was: unknown, indent: number) {
  const at = entries.findIndex(e => e.key === key)
  if (JSON.stringify(value) === JSON.stringify(was)) {
    return
  }
  if (value === undefined) {
    if (at >= 0) entries.splice(at, 1)
    return
  }
  const line = { key, lines: [`${' '.repeat(indent)}${key}: ${emit(value)}`] }
  if (at >= 0) {
    entries[at] = line
  } else {
    entries.push(line)
  }
}

function emit(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(emit).join(', ')}]`
  if (typeof value === 'object') {
    return `{ ${Object.entries(value).map(([k, v]) => `${k}: ${emit(v)}`).join(', ')} }`
  }
  const text = String(value)
  return /^[A-Za-z0-9_][A-Za-z0-9_ .\/-]*$/.test(text) && !/^(true|false|null|yes|no|~)$/i.test(text)
    && !text.endsWith(' ')
    ? text
    : JSON.stringify(text)
}

function indentOf(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0
}

function splitEntries(lines: string[], indent: number): Entry[] {
  const entries: Entry[] = []
  for (const line of lines) {
    const key = new RegExp(`^ {${indent}}([A-Za-z_][\\w-]*):(\\s|$)`).exec(line)
    if (key?.[1]) {
      entries.push({ key: key[1], lines: [line] })
    } else if (entries.length > 0) {
      entries[entries.length - 1]!.lines.push(line)
    } else {
      entries.push({ key: '', lines: [line] })
    }
  }
  return entries
}

function valueOf(entry: Entry | undefined): unknown {
  if (!entry) return undefined
  const first = entry.lines[0] ?? ''
  const rest = stripComment(first.slice(first.indexOf(':') + 1)).trim()
  if (rest !== '') return scalar(rest)
  const items = entry.lines.slice(1).map(l => /^\s*-\s+(.*)$/.exec(l)?.[1]).filter(v => v !== undefined)
  if (items.length > 0) return items.map(v => scalar(stripComment(v).trim()))
  const pairs = entry.lines.slice(1).map(l => /^\s+([\w-]+):\s*(.*)$/.exec(l)).filter(m => m !== null)
  return pairs.length > 0 ? Object.fromEntries(pairs.map(m => [m[1], scalar(stripComment(m[2] ?? '').trim())])) : undefined
}

function scalar(text: string): unknown {
  if (text.startsWith('[') && text.endsWith(']')) {
    return splitTop(text.slice(1, -1)).map(scalar)
  }
  if (text.startsWith('{') && text.endsWith('}')) {
    return Object.fromEntries(
      splitTop(text.slice(1, -1)).map(pair => {
        const at = pair.indexOf(':')
        return [pair.slice(0, at).trim(), scalar(pair.slice(at + 1).trim())]
      }),
    )
  }
  if (text.startsWith('"') && text.endsWith('"') && text.length > 1) {
    try {
      return JSON.parse(text)
    } catch {
      return text.slice(1, -1)
    }
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length > 1) return text.slice(1, -1).replaceAll("''", "'")
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null' || text === '~' || text === '') return null
  return text
}

// Splits on commas outside quotes and brackets.
function splitTop(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '[' || c === '{') {
      depth++
    } else if (c === ']' || c === '}') {
      depth--
    } else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = text.slice(start).trim()
  if (last !== '') parts.push(last)
  return parts
}

// Drops a ` # comment` outside quotes.
function stripComment(text: string): string {
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '#' && (i === 0 || /\s/.test(text[i - 1] ?? ''))) {
      return text.slice(0, i)
    }
  }
  return text
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function list(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
