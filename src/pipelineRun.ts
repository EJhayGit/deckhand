// The Pipeline's `$` side: Deckhand spawns each step's agent itself as a
// subagent, with nothing typed into the chat. The subagent's own turn.complete
// carries its answer, which becomes the step's result file; then the next step
// starts or the run stops for the owner's OK. If Claude Code refuses a spawn,
// "Send through chat" asks the main chat to start that agent instead.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, TurnUsage } from 'claude-code'

import type { DeckAgent, DeckTab, Finding, PipeKind, PipeRun, PipeSize, PipeStepId, Pipeline, Run } from '../types'
import { applyVerdicts, changedFiles, fixNote, isSerious, joinReviews, mergeFindings, parseFindings, reportText, reviewPrompt, reviewerPrompt, reviewersFor, skepticPrompt } from './findings'
import { routeOf } from './models'
import { KEEP, STEP_LABEL, after, blockedIn, chatPrompt, editsFiles, fileOf, newPipeline, planBump, preflight, runId, shortText, shortfallText, stepHead, stepPrompt, stopsStep, typeOf, withAgent } from './pipeline'
import type { Installed, PipeEvent } from './pipeline'
import type { Limit } from './limits'
import { addUsage, endRun, newRun } from './runs'
import { send } from './swarm'
import { onSpawned } from './tracker'

const pipeline = atom({ plugin: 'deckhand', key: 'pipeline' } as const, { kind: null, size: null, note: '', run: null, history: [] } as Pipeline)
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)
const runs = atom({ plugin: 'deckhand', key: 'runs' } as const, [] as Run[])
const tab = atom({ plugin: 'deckhand', key: 'tab' } as const, 'deck' as DeckTab)
const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const swarmOpen = atom({ plugin: 'deckhand', key: 'swarmOpen' } as const, null as string | null)

// One subagent to spawn for a step.
type Job = { type: string; prompt: string; title: string }

export async function startPipeline($: EngineInterface, task: string, kind: PipeKind, size: PipeSize): Promise<string[]> {
  if (task.trim() === '') return ['Type the task first.']
  const now = await read($, pipeline)
  if (now.run && !now.run.ended) return ['A pipeline is already running. Stop it first.']
  const cards = await read($, deck)
  const installed: Installed = Object.fromEntries(cards.map(c => [c.agent.name, c.agent.limits]))
  const local = cards.filter(c => routeOf(c.agent.model).kind === 'local' || routeOf(c.agent.model).kind === 'codex').map(c => c.agent.name)
  const run = newPipeline(runId(await $.clock.now()), task.trim(), kind, size, await read($, active), installed, now.agents ?? {})
  const short = preflight(run.steps, installed, local)
  if (short.length) {
    await update($, pipeline, p => ({ ...p, preflight: short }))
    return [`Can't start. ${short.map(shortfallText).join(' ')}`]
  }
  await update($, pipeline, p => ({ ...p, note: '', run, preflight: undefined, picking: null, history: [run.id, ...p.history].slice(0, KEEP) }))
  await update($, tab, () => 'swarm' as DeckTab)
  await startStep($, run, 0)

  return []
}

// A subagent ended. Only the current step's count; the step finishes once all
// of its subagents (one, or Review's reviewers) have ended.
export async function onPipelineAgentEnd($: EngineInterface, agentId: string, reason: string, answer: string): Promise<void> {
  const run = (await read($, pipeline)).run
  if (!run || run.ended || !run.agentIds?.includes(agentId) || run.answers?.[agentId]) return
  const next = { ...run, answers: { ...run.answers, [agentId]: { reason, answer } } }
  await update($, pipeline, p => ({ ...p, run: next }))
  if (!next.spawning) await concludeIfDone($, next)
}

// A main turn ended: counts only for a step sent through the chat.
export async function onPipelineTurnEnd($: EngineInterface, prompt: string, reason: string, answer: string, usage?: TurnUsage): Promise<void> {
  const run = (await read($, pipeline)).run
  if (!run || run.ended || run.prompt === null || run.prompt !== prompt) return
  const i = run.steps.findIndex(s => s.status === 'running')
  if (i < 0) return
  await endRow($, run, i, reason, usage)
  await finishStep($, { ...run, prompt: null }, i, reason, answer)
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

export async function retryPipeline($: EngineInterface): Promise<void> {
  await event($, { kind: 'retry' })
}

// Send through chat: the blocked step goes to the main chat as one visible
// prompt asking it to start the step's agent, for when Claude Code refused
// Deckhand's own spawn.
export async function chatPipeline($: EngineInterface): Promise<void> {
  const run = (await read($, pipeline)).run
  const i = run?.steps.findIndex(s => s.status === 'blocked' && s.refused) ?? -1
  if (!run || run.ended || i < 0) return
  const step = run.steps[i]!
  const cards = await read($, deck)
  let prompt: string
  if (step.id === 'review' && run.phase === 'skeptic') {
    const serious = (run.findings ?? []).filter(isSerious)
    prompt = chatPrompt(typeOf('skeptic', cardsOf(cards)), skepticPrompt(stepHead(run, i), diffOf(run, i), serious))
  } else if (step.id === 'review') {
    const review = await reviewInputs($, run, i)
    if (typeof review === 'string') {
      await failAt($, run, i, review)
      return
    }
    const agents = review.names.map(name => ({ name, type: typeOf(name, cardsOf(cards)) }))
    prompt = reviewPrompt(stepHead(run, i), review.diffFile, review.untracked, agents)
  } else {
    prompt = chatPrompt(typeOf(step.agent, cardsOf(cards)), stepPrompt(run, i))
  }
  const before = step.id !== 'review' && editsFiles(run, i) ? await filesState($) : run.before
  const steps = run.steps.map((s, j) => (j === i ? { ...s, status: 'running' as const, error: undefined, refused: undefined } : s))
  const next = { ...run, steps, prompt, before, blocked: undefined, agentIds: undefined, answers: undefined }
  await update($, pipeline, p => ({ ...p, run: next }))
  // The built-in agents are offered to the model until this turn ends.
  await update($, swarmOpen, () => prompt)
  await startRow($, next, i)
  await send($, prompt, false)
}

// Opens the agent picker for one step (undefined closes it).
export async function pickStep($: EngineInterface, step: PipeStepId | undefined): Promise<void> {
  await update($, pipeline, p => ({ ...p, picking: step ?? null }))
}

// An agent picked for a step, for this run only (null: plain Claude Code).
export async function pickAgent($: EngineInterface, step: PipeStepId, agent: string | null): Promise<void> {
  await update($, pipeline, p => ({
    ...p,
    agents: { ...p.agents, [step]: agent },
    picking: null,
    preflight: p.preflight?.filter(s => s.step !== step),
    run: p.run && !p.run.ended ? withAgent(p.run, step, agent) : p.run,
  }))
}

// The limit guard denied a call in the step's own loop (its subagent, or the
// main chat for a step sent through it): the step is blocked when it needs
// that permission.
export async function onPipelineBlocked($: EngineInterface, note: string, limit: Limit, agentId?: string): Promise<void> {
  await update($, pipeline, p => {
    const run = p.run
    const step = run?.steps.find(s => s.status === 'running')
    const isStepLoop = agentId === undefined ? run?.prompt !== null : run?.agentIds?.includes(agentId)
    if (!run || run.ended || run.blocked || !step || !isStepLoop || !stopsStep(step.id, limit)) return p
    return { ...p, run: { ...run, blocked: note } }
  })
}

export async function stopPipeline($: EngineInterface): Promise<void> {
  await event($, { kind: 'stop' })
}

export async function clearPipeline($: EngineInterface): Promise<void> {
  await update($, pipeline, p => (p.run?.ended ? { ...p, run: null, note: '', kind: null, size: null, agents: undefined, picking: null } : p))
}

async function event($: EngineInterface, e: PipeEvent) {
  const run = (await read($, pipeline)).run
  if (!run || run.ended) return
  if (e.kind === 'stop') {
    const i = run.steps.findIndex(s => s.status === 'running')
    if (i >= 0 && run.prompt !== null) await endRow($, run, i, 'aborted')
  }
  await apply($, run, e)
}

// Saves the run after an event, and starts the next step if there is one.
async function apply($: EngineInterface, run: PipeRun, e: PipeEvent) {
  const { run: next, next: index } = after({ ...run, agentIds: undefined, answers: undefined, spawning: undefined }, e)
  await update($, pipeline, p => ({ ...p, run: next, note: '' }))
  const blocked = next.steps.find(s => s.status === 'blocked')
  if (index !== null) {
    await startStep($, next, index)
  } else if (next.ended === 'failed') {
    $.ui.toast(`Pipeline stopped: ${next.error ?? 'a step failed.'}`)
  } else if (!next.ended && blocked) {
    $.ui.toast(`Pipeline blocked at ${STEP_LABEL[blocked.id]}: ${blocked.error}`)
  }
}

async function startStep($: EngineInterface, run: PipeRun, index: number) {
  const step = run.steps[index]!
  if (step.id === 'review') {
    await startReview($, run, index)
    return
  }
  const cards = await read($, deck)
  if (step.agent !== null && !cards.some(c => c.agent.name === step.agent)) {
    await failAt($, run, index, `There is no ${step.agent} agent in the deck.`)
    return
  }
  const before = editsFiles(run, index) ? await filesState($) : undefined
  await spawnAll($, { ...run, before, blocked: undefined }, index, [{ type: typeOf(step.agent, cardsOf(cards)), prompt: stepPrompt(run, index), title: titleOf(run, index) }])
}

// Spawns the step's subagents. A refusal blocks the step with Send through chat.
async function spawnAll($: EngineInterface, run: PipeRun, index: number, jobs: readonly Job[]) {
  const steps = run.steps.map((s, j) => (j === index ? { ...s, status: 'running' as const, summary: undefined, error: undefined, refused: undefined } : s))
  const ids: string[] = []
  await update($, pipeline, p => ({ ...p, run: { ...run, steps, prompt: null, agentIds: [], answers: {}, spawning: true } }))
  for (const job of jobs) {
    const started = await $.agent.spawn({ subagentType: job.type, prompt: job.prompt, description: job.title }).catch((error: unknown) => ({ deny: error instanceof Error ? error.message : String(error) }))
    const now = (await read($, pipeline)).run
    if (!now || now.id !== run.id || now.ended) return
    if ('deny' in started && started.deny) {
      const refused = now.steps.map((s, j) => (j === index ? { ...s, refused: true } : s))
      await apply($, { ...now, steps: refused }, { kind: 'blocked', reason: `Claude Code didn't start ${job.type}: ${started.deny}` })
      return
    }
    if (!('agentId' in started) || !started.agentId) continue
    ids.push(started.agentId)
    await onSpawned($, started.agentId, job.type, job.title, started.model)
    await update($, pipeline, p => (p.run?.id === run.id ? { ...p, run: { ...p.run, agentIds: [...ids] } } : p))
  }
  const now = (await read($, pipeline)).run
  if (!now || now.id !== run.id || now.ended) return
  if (ids.length === 0) {
    await failAt($, now, index, 'No subagent started.')
    return
  }
  const next = { ...now, spawning: undefined }
  await update($, pipeline, p => ({ ...p, run: next }))
  await concludeIfDone($, next)
}

async function concludeIfDone($: EngineInterface, run: PipeRun) {
  const ids = run.agentIds ?? []
  const ends = ids.map(id => run.answers?.[id])
  if (ids.length === 0 || ends.some(e => e === undefined)) return
  const i = run.steps.findIndex(s => s.status === 'running')
  if (i < 0) return
  const failed = ends.find(e => e!.reason !== 'answer')
  const isReviewers = run.steps[i]!.id === 'review' && run.phase !== 'skeptic'
  const answer = isReviewers ? joinReviews(ends.map(e => e!.answer)) : ends[0]!.answer
  await finishStep($, { ...run, agentIds: undefined, answers: undefined }, i, failed?.reason ?? 'answer', answer)
}

// A step's answer is in, from its subagent(s) or the chat: fail, block, or
// save it and go on.
async function finishStep($: EngineInterface, run: PipeRun, i: number, reason: string, answer: string) {
  if (reason !== 'answer') {
    await apply($, run, { kind: 'failed', error: reason === 'aborted' ? 'The step was interrupted.' : `The step ended with ${reason === 'refusal' ? 'a refusal' : 'an error'}.` })
    return
  }
  if (answer.trim() === '') {
    await apply($, run, { kind: 'failed', error: 'The step gave no result.' })
    return
  }
  if (run.steps[i]!.id === 'review') {
    await onReviewEnd($, run, i, answer)
    return
  }
  const blocked = run.blocked ?? blockedIn(answer, run.steps[i]!.id) ?? (await changedNothing($, run, i))
  if (blocked) {
    await apply($, run, { kind: 'blocked', reason: blocked })
    return
  }
  await $.fs.write(fileOf(run, i), answer)
  const steps = run.steps.map((s, j) => (j === i ? { ...s, summary: shortText(answer) } : s))
  const bump = run.steps[i]!.id === 'plan' ? planBump(run.size, answer) : undefined
  await apply($, { ...run, steps, ...(bump ? { size: bump.size, sizeNote: bump.note } : {}) }, { kind: 'done', answer })
}

async function failAt($: EngineInterface, run: PipeRun, index: number, error: string) {
  await apply($, { ...run, steps: run.steps.map((s, j) => (j === index ? { ...s, status: 'running' } : s)) }, { kind: 'failed', error })
}

// Review's inputs: the diff saved beside the result, new files, and who
// reviews. A string: why it can't run. Fails closed on no diff.
async function reviewInputs($: EngineInterface, run: PipeRun, index: number): Promise<{ diffFile: string; untracked: string[]; names: string[] } | string> {
  const status = await git($, ['git', 'status', '--porcelain'])
  const diff = await git($, ['git', 'diff', 'HEAD'])
  if (status === undefined || diff === undefined) return 'Couldn\'t read the diff with git.'
  const files = changedFiles(status)
  if (files.length === 0 && diff.trim() === '') return 'The diff is empty: nothing to review.'
  const diffFile = diffOf(run, index)
  await $.fs.write(diffFile, diff)
  const untracked = status.split(/\r?\n/).filter(l => l.startsWith('??')).map(l => l.slice(3))

  return { diffFile, untracked, names: reviewersFor(files, diff) }
}

// Review: the reviewers are spawned side by side on the diff.
async function startReview($: EngineInterface, run: PipeRun, index: number) {
  const review = await reviewInputs($, run, index)
  if (typeof review === 'string') {
    await failAt($, run, index, review)
    return
  }
  const cards = cardsOf(await read($, deck))
  const jobs = review.names.map(name => ({ type: typeOf(name, cards), prompt: reviewerPrompt(stepHead(run, index), review.diffFile, review.untracked, name), title: titleOf(run, index, name) }))
  await spawnAll($, { ...run, findings: undefined, phase: undefined }, index, jobs)
}

// The reviewers' lines are in: merge them, then spawn the skeptic on the
// serious ones; or, after the skeptic, take its verdicts.
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
  const cards = await read($, deck)
  if (!cards.some(c => c.agent.name === 'skeptic')) {
    await apply($, run, { kind: 'failed', error: 'There is no skeptic agent in the deck.' })
    return
  }
  const next = { ...run, findings, phase: 'skeptic' as const }
  const prompt = skepticPrompt(stepHead(run, index), diffOf(run, index), serious)
  await spawnAll($, next, index, [{ type: typeOf('skeptic', cardsOf(cards)), prompt, title: titleOf(next, index, 'skeptic') }])
}

async function finishReview($: EngineInterface, run: PipeRun, index: number, findings: Finding[]) {
  const text = reportText(findings)
  await $.fs.write(fileOf(run, index), text)
  const steps = run.steps.map((s, j) => (j === index ? { ...s, summary: shortText(text, 20) } : s))
  await apply($, { ...run, steps, findings }, { kind: 'done', answer: text })
}

async function git($: EngineInterface, argv: string[]): Promise<string | undefined> {
  const ran = await $.process.run(argv).catch(() => undefined)
  return ran?.exitCode === 0 ? ran.stdout : undefined
}

function cardsOf(cards: readonly DeckAgent[]) {
  return cards.map(c => ({ name: c.agent.name, agentType: c.agentType }))
}

function diffOf(run: PipeRun, index: number): string {
  return fileOf(run, index).replace(/\.md$/, '.diff')
}

// A step's tag in Runs, like `Pipeline 3/5 · Tests`.
function titleOf(run: PipeRun, index: number, who?: string): string {
  return `Pipeline ${index + 1}/${run.steps.length} · ${STEP_LABEL[run.steps[index]!.id]}${who ? ` (${who})` : ''}`
}

// The working tree's state, to tell whether a step changed anything.
async function filesState($: EngineInterface): Promise<string | undefined> {
  const status = await git($, ['git', 'status', '--porcelain'])
  const diff = await git($, ['git', 'diff', 'HEAD'])
  return status === undefined || diff === undefined ? undefined : `${status}\n${diff}`
}

// shortcut: a step that only changes ignored files counts as changing nothing.
async function changedNothing($: EngineInterface, run: PipeRun, index: number): Promise<string | undefined> {
  if (run.before === undefined || !editsFiles(run, index)) return undefined
  const now = await filesState($)
  return now === run.before ? `${STEP_LABEL[run.steps[index]!.id]} changed no files.` : undefined
}

// A Runs row for a step sent through the chat (spawned steps get theirs from
// onSpawned).
async function startRow($: EngineInterface, run: PipeRun, index: number) {
  const step = run.steps[index]!
  const row = newRun({
    agentId: rowId(run, index),
    title: titleOf(run, index, run.phase === 'skeptic' ? 'skeptic' : undefined),
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
