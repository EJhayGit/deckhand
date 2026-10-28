// Swarms: several agents on one task. Both modes go through the chat as the
// person's own prompt, so the request is in the transcript (auto mode refuses
// an Agent call nothing asked for) and Claude starts the agents itself.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { DeckAgent, DeckTab, SwarmMode } from '../types'
import { routeOf } from './models'
import { useAgent } from './session'

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const tab = atom({ plugin: 'deckhand', key: 'tab' } as const, 'deck' as DeckTab)
// The swarm prompt in flight: built-ins are offered to the model until its turn ends.
const swarmOpen = atom({ plugin: 'deckhand', key: 'swarmOpen' } as const, null as string | null)

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

export function partOf(presetId: string, name: string, description: string): string {
  return PRESETS.find(p => p.id === presetId)?.parts[name] ?? (description || name)
}

// The prompt that asks Claude to start each agent on its part. Pure.
export function parallelPrompt(task: string, agents: readonly { type: string; part: string }[]): string {
  const list = agents.map((a, i) => `${i + 1}. \`${a.type}\`: ${a.part}`).join('\n')

  return `Run a parallel swarm on this task:

${task}

Start every agent below now, in one message: one Agent call each, in the
background, with that subagent_type and the part as its description. Give each
the task above and its part, tell it to stay inside its part and not to edit
files another part owns, and to report its steps with
mcp__deckhand__deck_progress if that tool is available. Do none of the parts
yourself. When they finish, give me a short combined report.

${list}
`
}

// Asks Claude to start each picked agent. Local and Codex agents answer only
// the main chat, so they are skipped with a note.
export async function startParallel($: EngineInterface, presetId: string, names: readonly string[], task: string, later = false): Promise<string[]> {
  const cards = await read($, deck)
  const notes: string[] = []
  const agents: { type: string; part: string }[] = []
  for (const name of names) {
    const card = cards.find(c => c.agent.name === name)
    if (!card) continue
    const kind = routeOf(card.agent.model).kind
    if (kind === 'local' || kind === 'codex') {
      notes.push(`${name} runs on ${kind} and can't run as a subagent; skipped.`)
      continue
    }
    agents.push({ type: card.agentType ?? name, part: partOf(presetId, name, card.agent.description) })
  }
  if (agents.length === 0) return [...notes, 'No agent to start.']
  const text = parallelPrompt(task, agents)
  await update($, swarmOpen, () => text)
  await update($, tab, () => 'runs' as DeckTab)
  await send($, text, later)

  return notes
}

// The lead runs as the active agent so its delegations show in the chat.
export async function startLead($: EngineInterface, task: string, later = false): Promise<string[]> {
  if (!(await useAgent($, 'swarm-lead'))) return ['There is no swarm-lead agent in the deck.']
  await update($, tab, () => 'runs' as DeckTab)
  await send($, task, later)

  return []
}

export async function startSwarm($: EngineInterface, mode: SwarmMode, presetId: string, names: readonly string[], task: string, later = false): Promise<string[]> {
  if (task.trim() === '') return ['Type the task first.']
  if (mode === 'lead') return startLead($, task, later)
  if (names.length === 0) return ['Pick at least one agent.']

  return startParallel($, presetId, names, task, later)
}

// The main turn that carried the swarm prompt is over: hide the built-ins again.
export async function closeSwarm($: EngineInterface, prompt: string): Promise<void> {
  if ((await read($, swarmOpen)) === prompt) await update($, swarmOpen, () => null)
}

// `later`: a slash command can't submit while it holds the turn, so the
// prompt goes once the command has returned.
async function send($: EngineInterface, text: string, later: boolean) {
  if (later) {
    $.clock.after(0, () => void $.prompt.submit({ text, asUser: true }))
  } else {
    await $.prompt.submit({ text, asUser: true })
  }
}
