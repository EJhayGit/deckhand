// Turning an agent on and off for this session, and the status line.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Agent, Chips, DeckAgent, Pipeline, Run } from '../types'

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)
const chips = atom({ plugin: 'deckhand', key: 'chips' } as const, null as Chips | null)
const swarmOpen = atom({ plugin: 'deckhand', key: 'swarmOpen' } as const, null as string | null)
const runs = atom({ plugin: 'deckhand', key: 'runs' } as const, [] as Run[])
const pipeline = atom({ plugin: 'deckhand', key: 'pipeline' } as const, { kind: null, size: null, note: '', run: null, history: [] } as Pipeline)

const ALL = { edit: true, run: true, internet: true }

export function chipsOf(agent: Agent): Chips {
  return { model: agent.model, effort: agent.effort, limits: { ...agent.limits } }
}

export async function useAgent($: EngineInterface, name: string): Promise<boolean> {
  const card = (await read($, deck)).find(c => c.agent.name === name)
  if (!card) return false
  await update($, active, () => name)
  await update($, chips, () => chipsOf(card.agent))
  await showStatus($)

  return true
}

export async function useNone($: EngineInterface): Promise<void> {
  await update($, active, () => null)
  await update($, chips, () => null)
  await showStatus($)
}

// The active card and the chips in force, or undefined when none is active.
export async function current($: EngineInterface): Promise<{ card: DeckAgent; chips: Chips } | undefined> {
  const name = await read($, active)
  const card = (await read($, deck)).find(c => c.agent.name === name)
  if (!card) return undefined

  return { card, chips: (await read($, chips)) ?? chipsOf(card.agent) }
}

// A subagent loop's own name and limits: a Pipeline step's agent (plain Claude
// Code: all on), else the deck agent its Runs row names. Undefined: not one
// of these, so the agent in use's limits hold.
export async function loopAgent($: EngineInterface, agentId: string): Promise<{ name: string; limits: Chips['limits'] } | undefined> {
  const cards = await read($, deck)
  const run = (await read($, pipeline)).run
  if (run && !run.ended && run.agentIds?.includes(agentId)) {
    const step = run.steps.find(s => s.status === 'running')
    const name = run.phase === 'skeptic' ? 'skeptic' : step?.id === 'review' ? undefined : step?.agent
    if (step && name === null) return { name: 'plain Claude Code', limits: ALL }
    const card = name ? cards.find(c => c.agent.name === name) : undefined
    if (card) return { name: card.agent.name, limits: card.agent.limits }
  }
  const row = (await read($, runs)).find(r => r.agentId === agentId)
  const card = row ? cards.find(c => c.agent.name === row.name) : undefined

  return card ? { name: card.agent.name, limits: card.agent.limits } : undefined
}

// Built-in agents stay out of the model's agent list, so they cost no tokens,
// except while a swarm or review prompt is starting them.
export async function isHiddenAgent($: EngineInterface, agentType: string): Promise<boolean> {
  const card = (await read($, deck)).find(c => c.agentType === agentType)

  return card?.source === 'builtin' && (await read($, swarmOpen)) === null
}

// The Deck pane already shows the agent, so the status line stays clear.
export async function showStatus($: EngineInterface): Promise<void> {
  $.ui.status(undefined)
}
