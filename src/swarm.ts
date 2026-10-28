// Swarms: several agents on one task. Parallel starts each picked agent at
// once; Lead hands the task to swarm-lead, which delegates.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { DeckAgent, DeckTab, SwarmMode } from '../types'
import { routeOf } from './models'
import { useAgent } from './session'
import { onSpawned } from './tracker'

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const tab = atom({ plugin: 'deckhand', key: 'tab' } as const, 'deck' as DeckTab)

export type Preset = { id: string; label: string; parts: Record<string, string> }

export const PRESETS: readonly Preset[] = [
  {
    id: 'launch-kit',
    label: 'Launch kit',
    parts: {
      researcher: 'Research competitor launches',
      'frontend-designer': 'Build the landing page',
      'graphics-designer': 'Design the launch graphics',
      reviewer: 'Review the whole kit',
    },
  },
  {
    id: 'security-sweep',
    label: 'Security sweep',
    parts: {
      'security-auditor': 'Audit the code for security bugs',
      'dependency-auditor': 'Audit the dependencies',
      'change-security-review': 'Review this branch for security regressions',
    },
  },
  {
    id: 'ship-check',
    label: 'Ship check',
    parts: {
      reviewer: 'Review the changes',
      'test-runner': 'Run the tests',
      'website-reviewer': 'Review the live site',
    },
  },
]

// What one agent of a parallel swarm is told. Pure.
export function partPrompt(task: string, part: string): string {
  return `You are one agent in a team working on this task:

${task}

Your part: ${part}

Do only your part; other agents handle the rest, so do not edit files outside
your part. If the mcp__deckhand__deck_progress tool is available, call it with
your plan's step count at the start and as each step finishes. End with a short
report of what you did and found.
`
}

export function partOf(presetId: string, name: string, description: string): string {
  return PRESETS.find(p => p.id === presetId)?.parts[name] ?? (description || name)
}

// What `$.agent.spawn` gets for one card. Pure.
export function spawnArgs(card: DeckAgent, presetId: string, task: string): { prompt: string; subagentType: string; description: string } {
  const part = partOf(presetId, card.agent.name, card.agent.description)

  return { prompt: partPrompt(task, part), subagentType: card.agentType ?? card.agent.name, description: part }
}

// Starts each picked agent in the background. Local and Codex agents answer
// only the main chat, so they are skipped with a note.
export async function startParallel($: EngineInterface, presetId: string, names: readonly string[], task: string): Promise<string[]> {
  const cards = await read($, deck)
  const notes: string[] = []
  for (const name of names) {
    const card = cards.find(c => c.agent.name === name)
    if (!card) continue
    const kind = routeOf(card.agent.model).kind
    if (kind === 'local' || kind === 'codex') {
      notes.push(`${name} runs on ${kind} and can't run as a subagent; skipped.`)
      continue
    }
    const args = spawnArgs(card, presetId, task)
    const started = await $.agent.spawn(args).catch((err: unknown) => ({ deny: String(err) }))
    if ('deny' in started && started.deny) {
      notes.push(`${name} didn't start: ${started.deny}`)
    } else if ('agentId' in started && started.agentId) {
      // The mod's own agent.spawn hook doesn't hear the mod's own spawns.
      await onSpawned($, started.agentId, args.subagentType, args.description, started.model)
    }
  }
  await update($, tab, () => 'runs' as DeckTab)

  return notes
}

// The lead runs as the active agent so its delegations show in the chat.
// `later`: a slash command can't submit while it holds the turn, so the
// prompt goes once the command has returned.
export async function startLead($: EngineInterface, task: string, later = false): Promise<string[]> {
  if (!(await useAgent($, 'swarm-lead'))) return ['There is no swarm-lead agent in the deck.']
  await update($, tab, () => 'runs' as DeckTab)
  if (later) {
    $.clock.after(0, () => void $.prompt.submit({ text: task, asUser: true }))
  } else {
    await $.prompt.submit({ text: task, asUser: true })
  }

  return []
}

export async function startSwarm($: EngineInterface, mode: SwarmMode, presetId: string, names: readonly string[], task: string, later = false): Promise<string[]> {
  if (task.trim() === '') return ['Type the task first.']
  if (mode === 'lead') return startLead($, task, later)
  if (names.length === 0) return ['Pick at least one agent.']

  return startParallel($, presetId, names, task)
}
