// The Pipeline's `$` side: each step goes to the main chat as the person's own
// prompt, with that step's agent in use so its limits hold in `tool.call`.
// The turn's answer becomes the step's result file, and the next step starts
// or the run stops for the owner's OK.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, TurnUsage } from 'claude-code'

import type { DeckTab, PipeKind, PipeRun, PipeSize, Pipeline, Run } from '../types'
import { KEEP, STEP_LABEL, after, fileOf, newPipeline, runId, shortText, stepPrompt } from './pipeline'
import type { PipeEvent } from './pipeline'
import { addUsage, endRun, newRun } from './runs'
import { useAgent, useNone } from './session'
import { send } from './swarm'

const pipeline = atom({ plugin: 'deckhand', key: 'pipeline' } as const, { kind: null, size: null, note: '', run: null, history: [] } as Pipeline)
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)
const runs = atom({ plugin: 'deckhand', key: 'runs' } as const, [] as Run[])
const tab = atom({ plugin: 'deckhand', key: 'tab' } as const, 'deck' as DeckTab)

export async function startPipeline($: EngineInterface, task: string, kind: PipeKind, size: PipeSize): Promise<string[]> {
  if (task.trim() === '') return ['Type the task first.']
  const now = await read($, pipeline)
  if (now.run && !now.run.ended) return ['A pipeline is already running. Stop it first.']
  const run = newPipeline(runId(await $.clock.now()), task.trim(), kind, size, await read($, active))
  await update($, pipeline, p => ({ ...p, note: '', run, history: [run.id, ...p.history].slice(0, KEEP) }))
  await update($, tab, () => 'swarm' as DeckTab)
  await startStep($, run, 0, false)

  return []
}

// A main turn ended. Only the turn that carried the current step counts.
export async function onPipelineTurnEnd($: EngineInterface, prompt: string, reason: string, answer: string, usage?: TurnUsage): Promise<void> {
  const run = (await read($, pipeline)).run
  if (!run || run.ended || run.prompt === null || run.prompt !== prompt) return
  const i = run.steps.findIndex(s => s.status === 'running')
  if (i < 0) return
  await endRow($, run, i, reason, usage)
  if (reason !== 'answer') {
    await apply($, { ...run, prompt: null }, { kind: 'failed', error: reason === 'aborted' ? 'The step was interrupted.' : `The step ended with ${reason === 'refusal' ? 'a refusal' : 'an error'}.` })
    return
  }
  if (answer.trim() === '') {
    await apply($, { ...run, prompt: null }, { kind: 'failed', error: 'The step gave no result.' })
    return
  }
  await $.fs.write(fileOf(run, i), answer)
  const steps = run.steps.map((s, j) => (j === i ? { ...s, summary: shortText(answer) } : s))
  await apply($, { ...run, steps, prompt: null }, { kind: 'done', answer }, true)
}

export async function approvePipeline($: EngineInterface): Promise<void> {
  await event($, { kind: 'approve' })
}

export async function changePipeline($: EngineInterface, note: string): Promise<void> {
  if (note.trim() === '') {
    $.ui.toast('Type what to change first.')
    return
  }
  await event($, { kind: 'change', note: note.trim() })
}

export async function stopPipeline($: EngineInterface): Promise<void> {
  await event($, { kind: 'stop' })
}

export async function clearPipeline($: EngineInterface): Promise<void> {
  await update($, pipeline, p => (p.run?.ended ? { ...p, run: null, note: '', kind: null, size: null } : p))
}

async function event($: EngineInterface, e: PipeEvent) {
  const run = (await read($, pipeline)).run
  if (!run || run.ended) return
  if (e.kind === 'stop') {
    const i = run.steps.findIndex(s => s.status === 'running')
    if (i >= 0) await endRow($, run, i, 'aborted')
  }
  await apply($, run, e)
}

// Saves the run after an event; starts the next step, or puts the owner's
// agent back when it ended.
async function apply($: EngineInterface, run: PipeRun, e: PipeEvent, later = false) {
  const { run: next, next: index } = after(run, e)
  await update($, pipeline, p => ({ ...p, run: next, note: '' }))
  if (index !== null) {
    await startStep($, next, index, later)
  } else if (next.ended) {
    await restore($, next)
    if (next.ended === 'failed') $.ui.toast(`Pipeline stopped: ${next.error ?? 'a step failed.'}`)
  }
}

// `later`: from a turn's end the prompt can't go while the hook holds the turn.
async function startStep($: EngineInterface, run: PipeRun, index: number, later: boolean) {
  const step = run.steps[index]!
  const isReady = step.agent === null ? (await useNone($), true) : await useAgent($, step.agent)
  if (!isReady) {
    await apply($, { ...run, steps: run.steps.map((s, j) => (j === index ? { ...s, status: 'running' } : s)) }, { kind: 'failed', error: `There is no ${step.agent} agent in the deck.` })
    return
  }
  const prompt = stepPrompt(run, index)
  const steps = run.steps.map((s, j) => (j === index ? { ...s, status: 'running' as const, summary: undefined, error: undefined } : s))
  await update($, pipeline, p => ({ ...p, run: { ...run, steps, prompt } }))
  await startRow($, run, index)
  await send($, prompt, later)
}

async function restore($: EngineInterface, run: PipeRun) {
  if (run.owner === null || !(await useAgent($, run.owner))) await useNone($)
}

// A Runs row per step, tagged like `Pipeline 3/5 · Tests`.
async function startRow($: EngineInterface, run: PipeRun, index: number) {
  const step = run.steps[index]!
  const row = newRun({
    agentId: rowId(run, index),
    title: `Pipeline ${index + 1}/${run.steps.length} · ${STEP_LABEL[step.id]}`,
    name: step.agent ?? 'chat',
    model: 'main chat',
  }, await $.clock.now())
  await update($, runs, now => [...now.filter(r => r.agentId !== row.agentId), row])
}

async function endRow($: EngineInterface, run: PipeRun, index: number, reason: string, usage?: TurnUsage) {
  const at = await $.clock.now()
  const end = reason === 'answer' || reason === 'aborted' || reason === 'refusal' ? reason : 'error'
  await update($, runs, now => now.map(r => {
    if (r.agentId !== rowId(run, index)) return r
    return endRun(usage ? addUsage(r, usage, usage.model) : r, end, at)
  }))
}

function rowId(run: PipeRun, index: number): string {
  return `pipeline:${run.id}:${index}`
}
