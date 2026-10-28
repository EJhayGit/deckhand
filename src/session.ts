// Turning an agent on and off for this session, and the status line.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Agent, Chips, DeckAgent } from '../types'

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)
const chips = atom({ plugin: 'deckhand', key: 'chips' } as const, null as Chips | null)
const swarmOpen = atom({ plugin: 'deckhand', key: 'swarmOpen' } as const, null as string | null)

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

// Built-in agents stay out of the model's agent list, so they cost no tokens,
// except while swarm-lead is in use or a swarm prompt is starting them.
export async function isHiddenAgent($: EngineInterface, agentType: string): Promise<boolean> {
  const card = (await read($, deck)).find(c => c.agentType === agentType)

  return card?.source === 'builtin' && (await read($, active)) !== 'swarm-lead' && (await read($, swarmOpen)) === null
}

// The band already shows the agent, so the status line stays clear.
export async function showStatus($: EngineInterface): Promise<void> {
  $.ui.status(undefined)
}
