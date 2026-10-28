// Agent files on disk and the cross-project library in $.store.
import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Agent, DeckAgent } from '../../types'
import { toolLists } from '../limits'
import { parseAgent, serializeAgent } from './format'

export const AGENTS_DIR = '.claude/agents'
export const ICONS_DIR = '.claude/deckhand/icons'
const LIBRARY = 'library'
const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])

export function agentPath(name: string): string {
  return `${AGENTS_DIR}/${name}.md`
}

export async function readLibrary($: EngineInterface): Promise<Record<string, string>> {
  const library = await $.store.get(LIBRARY)
  return typeof library === 'object' && library !== null ? (library as Record<string, string>) : {}
}

// Project files first; library agents with no project file after them.
export async function loadDeck($: EngineInterface): Promise<DeckAgent[]> {
  const library = await readLibrary($)
  const entries = await $.fs.list(AGENTS_DIR).catch(() => [])
  const files = entries.filter(f => f.kind === 'file' && f.name.endsWith('.md')).map(f => f.name)
  const deck: DeckAgent[] = []

  for (const file of files.sort()) {
    const text = await $.fs.read(`${AGENTS_DIR}/${file}`).catch(() => undefined)
    if (typeof text !== 'string') continue
    const { agent } = parseAgent(text)
    if (agent.name === '') agent.name = file.slice(0, -3)
    deck.push({ agent, source: 'project', isInLibrary: library[agent.name] !== undefined, text })
  }
  for (const [name, text] of Object.entries(library)) {
    if (deck.some(d => d.agent.name === name)) continue
    deck.push({ agent: parseAgent(text).agent, source: 'library', isInLibrary: true, text })
  }
  for (const card of deck) {
    const icon = card.agent.icon
    if (icon?.endsWith('.svg')) {
      const svg = await $.fs.read(`${ICONS_DIR}/${icon}`).catch(() => undefined)
      if (typeof svg === 'string') card.iconSvg = svg
    }
  }

  return deck
}

// The agent's file text with its limits applied to its tool lists.
export function agentText(agent: Agent, oldText?: string): string {
  const lists = toolLists(agent)
  const saved = { ...agent, tools: lists.tools, disallowedTools: lists.disallowedTools }

  return serializeAgent(saved, oldText === undefined ? undefined : parseAgent(oldText))
}

// Writes the agent's project file, keeping what the old text held.
export async function writeAgent($: EngineInterface, agent: Agent, oldText?: string): Promise<string> {
  const text = agentText(agent, oldText)
  await $.fs.write(agentPath(agent.name), text)

  return text
}

export async function saveToLibrary($: EngineInterface, name: string, text: string): Promise<void> {
  await $.store.set(LIBRARY, { ...(await readLibrary($)), [name]: text })
}

// Removes the card from where it lives: the project file, else the library.
export async function removeAgent($: EngineInterface, card: DeckAgent): Promise<boolean> {
  if (card.source === 'library') {
    const { [card.agent.name]: _gone, ...rest } = await readLibrary($)
    await $.store.set(LIBRARY, rest)
    return true
  }
  // $.fs has no delete, so the file goes through a host command.
  const path = agentPath(card.agent.name)
  for (const argv of [['rm', '-f', path], ['cmd', '/c', 'del', '/q', path.replaceAll('/', '\\')]]) {
    const ran = await $.process.run(argv).catch(() => undefined)
    if (ran?.exitCode === 0 && !(await $.fs.exists(path))) return true
  }
  return false
}

// Claude Code loads project agent files itself; library-only agents need
// registering so Claude can delegate to them here too.
export async function registerAgent($: EngineInterface, agent: Agent): Promise<void> {
  const lists = toolLists(agent)
  await $.agent.register({
    name: agent.name,
    description: agent.description || agent.name,
    prompt: agent.body,
    ...(lists.tools ? { tools: lists.tools } : {}),
    ...(lists.disallowedTools?.length ? { disallowedTools: lists.disallowedTools } : {}),
    ...(agent.model && agent.gateway === null ? { model: agent.model } : {}),
    ...(agent.effort ? { effort: agent.effort } : {}),
  })
}

// Reloads the deck into state and registers the library-only agents.
export async function refreshDeck($: EngineInterface): Promise<DeckAgent[]> {
  const cards = await loadDeck($)
  await update($, deck, () => cards)
  for (const card of cards.filter(c => c.source === 'library')) {
    await registerAgent($, card.agent).catch(() => undefined)
  }

  return cards
}
