// The Pipeline's `$` side: each step goes to the main chat as the person's own
// prompt, with that step's agent in use so its limits hold in `tool.call`.
// The turn's answer becomes the step's result file, and the next step starts
// or the run stops for the owner's OK.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, TurnUsage } from 'claude-code'

import type { DeckAgent, DeckTab, Finding, PipeKind, PipeRun, PipeSize, Pipeline, Run } from '../types'
import { applyVerdicts, changedFiles, fixNote, isSerious, mergeFindings, parseFindings, reportText, reviewPrompt, reviewersFor, skepticPrompt } from './findings'
import { KEEP, STEP_LABEL, after, fileOf, newPipeline, planBump, runId, shortText, stepHead, stepPrompt } from './pipeline'
import type { PipeEvent } from './pipeline'
import { addUsage, endRun, newRun } from './runs'
import { useAgent, useNone } from './session'
import { send } from './swarm'

const pipeline = atom({ plugin: 'deckhand', key: 'pipeline' } as const, { kind: null, size: null, note: '', run: null, history: [] } as Pipeline)
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)
const runs = atom({ plugin: 'deckhand', key: 'runs' } as const, [] as Run[])
const tab = atom({ plugin: 'deckhand', key: 'tab' } as const, 'deck' as DeckTab)
const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const swarmOpen = atom({ plugin: 'deckhand', key: 'swarmOpen' } as const, null as string | null)

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
  if (run.steps[i]!.id === 'review') {
    await onReviewEnd($, { ...run, prompt: null }, i, answer)
    return
  }
  await $.fs.write(fileOf(run, i), answer)
  const steps = run.steps.map((s, j) => (j === i ? { ...s, summary: shortText(answer) } : s))
  const bump = run.steps[i]!.id === 'plan' ? planBump(run.size, answer) : undefined
  await apply($, { ...run, steps, prompt: null, ...(bump ? { size: bump.size, sizeNote: bump.note } : {}) }, { kind: 'done', answer }, true)
}

// "Fix these first" at the Commit gate: Build again with the confirmed
// findings, then Review again.
export async function fixFirstPipeline($: EngineInterface): Promise<void> {
  const run = (await read($, pipeline)).run
  if (!run?.findings?.some(f => f.verdict === 'confirmed')) return
  await event($, { kind: 'redo', from: 'build', note: fixNote(run.findings) })
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
    await failAt($, run, index, `There is no ${step.agent} agent in the deck.`)
    return
  }
  if (step.id === 'review') {
    await startReview($, run, index, later)
    return
  }
  await submit($, run, index, stepPrompt(run, index), later)
}

async function submit($: EngineInterface, run: PipeRun, index: number, prompt: string, later: boolean) {
  const steps = run.steps.map((s, j) => (j === index ? { ...s, status: 'running' as const, summary: undefined, error: undefined } : s))
  const next = { ...run, steps, prompt }
  await update($, pipeline, p => ({ ...p, run: next }))
  await startRow($, next, index)
  await send($, prompt, later)
}

async function failAt($: EngineInterface, run: PipeRun, index: number, error: string) {
  await apply($, { ...run, steps: run.steps.map((s, j) => (j === index ? { ...s, status: 'running' } : s)) }, { kind: 'failed', error })
}

// Review, turn 1: the reviewers start side by side on the diff and the main
// chat hands back their finding lines. Fails closed on no diff.
async function startReview($: EngineInterface, run: PipeRun, index: number, later: boolean) {
  const status = await git($, ['git', 'status', '--porcelain'])
  const diff = await git($, ['git', 'diff', 'HEAD'])
  if (status === undefined || diff === undefined) {
    await failAt($, run, index, 'Couldn\'t read the diff with git.')
    return
  }
  const files = changedFiles(status)
  if (files.length === 0 && diff.trim() === '') {
    await failAt($, run, index, 'The diff is empty: nothing to review.')
    return
  }
  const diffFile = fileOf(run, index).replace(/\.md$/, '.diff')
  await $.fs.write(diffFile, diff)
  const cards = await read($, deck)
  const agents = reviewersFor(files, diff).map(name => ({ name, type: cards.find(c => c.agent.name === name)?.agentType ?? `deckhand:${name}` }))
  const untracked = status.split(/\r?\n/).filter(l => l.startsWith('??')).map(l => l.slice(3))
  const prompt = reviewPrompt(stepHead(run, index), diffFile, untracked, agents)
  // The built-in reviewers are offered to the model until this turn ends.
  await update($, swarmOpen, () => prompt)
  await submit($, { ...run, findings: undefined, phase: undefined }, index, prompt, later)
}

// Review's turn ended: merge the finding lines, then have the skeptic check
// the serious ones; or, after the skeptic, take its verdicts.
async function onReviewEnd($: EngineInterface, run: PipeRun, index: number, answer: string) {
  if (run.phase === 'skeptic') {
    await finishReview($, { ...run, phase: undefined }, index, applyVerdicts(run.findings ?? [], answer))
    return
  }
  let findings: Finding[]
  try {
    findings = mergeFindings(parseFindings(answer))
  } catch (error) {
    await apply($, run, { kind: 'failed', error: error instanceof Error ? error.message : String(error) })
    return
  }
  const serious = findings.filter(isSerious)
  if (serious.length === 0) {
    await finishReview($, run, index, findings)
    return
  }
  if (!(await useAgent($, 'skeptic'))) {
    await apply($, run, { kind: 'failed', error: 'There is no skeptic agent in the deck.' })
    return
  }
  const diffFile = fileOf(run, index).replace(/\.md$/, '.diff')
  const prompt = skepticPrompt(stepHead(run, index), diffFile, serious)
  const next = { ...run, findings, phase: 'skeptic' as const, prompt }
  await update($, pipeline, p => ({ ...p, run: next }))
  await startRow($, next, index)
  await send($, prompt, true)
}

async function finishReview($: EngineInterface, run: PipeRun, index: number, findings: Finding[]) {
  const text = reportText(findings)
  await $.fs.write(fileOf(run, index), text)
  const steps = run.steps.map((s, j) => (j === index ? { ...s, summary: shortText(text, 20) } : s))
  await apply($, { ...run, steps, findings }, { kind: 'done', answer: text }, true)
}

async function git($: EngineInterface, argv: string[]): Promise<string | undefined> {
  const ran = await $.process.run(argv).catch(() => undefined)
  return ran?.exitCode === 0 ? ran.stdout : undefined
}

async function restore($: EngineInterface, run: PipeRun) {
  if (run.owner === null || !(await useAgent($, run.owner))) await useNone($)
}

// A Runs row per step, tagged like `Pipeline 3/5 · Tests`.
async function startRow($: EngineInterface, run: PipeRun, index: number) {
  const step = run.steps[index]!
  const row = newRun({
    agentId: rowId(run, index),
    title: `Pipeline ${index + 1}/${run.steps.length} · ${STEP_LABEL[step.id]}${run.phase === 'skeptic' ? ' (skeptic)' : ''}`,
    name: run.phase === 'skeptic' ? 'skeptic' : (step.agent ?? 'chat'),
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
  return `pipeline:${run.id}:${index}${run.phase === 'skeptic' ? ':skeptic' : ''}`
}
