// Feeds the Runs view: a record per spawned agent, updated by its steps, its
// progress reports and its end.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { DeckAgent, Run } from '../types'
import { addUsage, endRun, newRun, setSteps } from './runs'
import type { Usage } from './runs'

const runs = atom({ plugin: 'deckhand', key: 'runs' } as const, [] as Run[])
const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])

export const PROGRESS_TOOL = {
  name: 'deck_progress',
  description: 'Report progress on your own task to the Deckhand Runs view. Call it with total (your plan in 3-8 steps) and done: 0 at the start, then again as each step finishes. Cheap and silent.',
  inputSchema: {
    type: 'object',
    properties: {
      done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
      total: { type: 'integer', minimum: 1, description: 'Steps planned.' },
      note: { type: 'string', description: 'The step in progress, a few words.' },
    },
    required: ['done', 'total'],
  },
}

// The module's own: redraws the clocks once a second while anything runs.
let ticker: { cancel: () => void } | undefined

export async function onSpawned($: EngineInterface, agentId: string, subagentType: string | undefined, description: string, model: string): Promise<void> {
  const name = (subagentType ?? '').replace(/^deckhand:/, '')
  const card = (await read($, deck)).find(c => c.agentType === subagentType || c.agent.name === name)
  const run = newRun({
    agentId,
    title: description || name || 'Agent',
    name: card?.agent.name ?? (name || 'agent'),
    model,
    effort: card?.agent.effort,
    color: card?.agent.color,
    hat: card?.hat,
  }, await $.clock.now())
  await update($, runs, now => [...now.filter(r => r.agentId !== agentId), run])
  tick($)
}

export async function onStep($: EngineInterface, agentId: string, usage: Usage, model: string): Promise<void> {
  await update($, runs, now => now.map(r => (r.agentId === agentId ? addUsage(r, usage, model) : r)))
}

export async function onAgentEnd($: EngineInterface, agentId: string, reason: 'answer' | 'aborted' | 'refusal' | 'error'): Promise<void> {
  const at = await $.clock.now()
  await update($, runs, now => now.map(r => (r.agentId === agentId ? endRun(r, reason, at) : r)))
}

export async function onProgress($: EngineInterface, agentId: string | undefined, input: Record<string, unknown>): Promise<string> {
  const done = Number(input.done)
  const total = Number(input.total)
  if (agentId === undefined || !Number.isFinite(done) || !Number.isFinite(total)) return 'Progress is for subagents; nothing recorded.'
  await update($, runs, now => now.map(r => (r.agentId === agentId ? setSteps(r, done, total) : r)))

  return 'Recorded.'
}

export async function clearFinished($: EngineInterface): Promise<void> {
  await update($, runs, now => now.filter(r => r.status === 'running'))
}

function tick($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(1000, () => {
    void (async () => {
      if ((await read($, runs)).some(r => r.status === 'running')) {
        $.ui.invalidate('ui.render')
      } else {
        ticker?.cancel()
        ticker = undefined
      }
    })()
  })
}
