// The Pipeline's `$` side: each step goes to the chat as one visible prompt
// asking it to start the step's agent (auto mode refuses a spawn nothing in the
// chat asked for). Deckhand notes the agents that turn starts and waits for
// their own turn.complete: that answer becomes the step's result file, then
// the next step is sent or the run stops for the owner's OK.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { DeckAgent, DeckTab, Finding, PipeKind, PipeRun, PipeSize, PipeStepId, Pipeline } from '../types'
import { applyVerdicts, brakeText, changedFiles, fixesText, isPicked, isSerious, joinReviews, mergeFindings, parseFindings, progress, reportText, reviewPrompt, reviewersFor, roundsCap, skepticPrompt, togglePick } from './findings'
import { routeOf } from './models'
import { KEEP, STEP_LABEL, after, blockedIn, chatPrompt, editsFiles, fileOf, fixesOf, newPipeline, planBump, preflight, runId, shortText, shortfallText, stepHead, stepPrompt, stopsStep, typeOf, withAgent } from './pipeline'
import type { Installed, PipeEvent } from './pipeline'
import type { Limit } from './limits'
import { send } from './swarm'

const pipeline = atom({ plugin: 'deckhand', key: 'pipeline' } as const, { kind: null, size: null, note: '', run: null, history: [] } as Pipeline)
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)
const tab = atom({ plugin: 'deckhand', key: 'tab' } as const, 'deck' as DeckTab)
const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const swarmOpen = atom({ plugin: 'deckhand', key: 'swarmOpen' } as const, null as string | null)

export async function startPipeline($: EngineInterface, task: string, kind: PipeKind, size: PipeSize): Promise<string[]> {
  if (task.trim() === '') return ['Type the task first.']
  const now = await read($, pipeline)
  if (now.run && !now.run.ended) return ['A pipeline is already running. Stop it first.']
  const cards = await read($, deck)
  const installed: Installed = Object.fromEntries(cards.map(c => [c.agent.name, c.agent.limits]))
  const run = { ...newPipeline(runId(await $.clock.now()), task.trim(), kind, size, await read($, active), installed, now.agents ?? {}), cap: roundsCap(now.rounds) }
  const short = preflight(run.steps, installed, localOf(cards))
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

// A spawn in the main loop during the step's chat turn is the step's agent.
function isStepTurn(run: PipeRun | null, parentAgentId: string | undefined, turnPrompt: string): run is PipeRun {
  return run !== null && !run.ended && parentAgentId === undefined && run.spawning === true && run.prompt === turnPrompt
}

// The Runs title for a step's spawn, like `Pipeline 3/5 · Tests`; undefined
// when the spawn isn't a Pipeline step's.
export async function pipelineSpawnTitle($: EngineInterface, parentAgentId: string | undefined, turnPrompt: string, subagentType: string | undefined): Promise<string | undefined> {
  const run = (await read($, pipeline)).run
  if (!isStepTurn(run, parentAgentId, turnPrompt)) return undefined
  const i = run.steps.findIndex(s => s.status === 'running')
  const who = run.steps[i]?.id === 'review' ? ` (${(subagentType ?? '').replace(/^deckhand:/, '')})` : ''

  const at = run.round ? `Round ${run.round}/${run.cap ?? run.round}` : `Pipeline ${i + 1}/${run.steps.length}`

  return `${at} · ${STEP_LABEL[run.steps[i]!.id]}${who}`
}

export async function onPipelineSpawn($: EngineInterface, agentId: string, parentAgentId: string | undefined, turnPrompt: string): Promise<void> {
  await update($, pipeline, p => (isStepTurn(p.run, parentAgentId, turnPrompt) ? { ...p, run: { ...p.run, agentIds: [...(p.run.agentIds ?? []), agentId] } } : p))
}

// The step's chat turn ended. Its own reply is never the result: the step
// waits for the agents it started. None started: the step is blocked.
export async function onPipelineTurnEnd($: EngineInterface, prompt: string, reason: string): Promise<void> {
  const run = (await read($, pipeline)).run
  if (!run || run.ended || !run.spawning || run.prompt !== prompt) return
  const i = run.steps.findIndex(s => s.status === 'running')
  if (i < 0) return
  const next = { ...run, prompt: null, spawning: undefined }
  if (!next.agentIds?.length) {
    if (reason !== 'answer') {
      await finishStep($, next, i, reason, '')
    } else {
      await apply($, next, { kind: 'blocked', reason: `The chat didn't start the ${STEP_LABEL[run.steps[i]!.id]} agent. Retry, or pick another agent.` })
    }
    return
  }
  await update($, pipeline, p => ({ ...p, run: next }))
  await concludeIfDone($, next)
}

// Fix these at the Review gate (Change there too): the ticked findings and
// the note go to Build, then Review reads the new diff. One round.
export async function fixPipeline($: EngineInterface, note?: string): Promise<void> {
  const p = await read($, pipeline)
  const run = p.run
  if (!run || run.ended || run.steps.find(s => s.status === 'gate')?.id !== 'review') return
  const text = (note ?? p.note).trim()
  if (!(run.findings ?? []).some(isPicked) && text === '') {
    $.ui.toast('Tick a finding or type a note first.')
    return
  }
  await fixRound($, run, text)
}

async function fixRound($: EngineInterface, run: PipeRun, note: string) {
  const findings = run.findings ?? []
  await $.fs.write(fixesOf(run), fixesText(findings, note))
  // The tree before Build, so Review reads this round's change only.
  const base = (await git($, ['git', 'stash', 'create']))?.trim()
  await apply($, run, { kind: 'fix', previous: findings, base: base || 'HEAD' })
}

export async function toggleFinding($: EngineInterface, id: number): Promise<void> {
  await update($, pipeline, p => (p.run?.findings ? { ...p, run: { ...p.run, findings: togglePick(p.run.findings, id) } } : p))
}

export async function approvePipeline($: EngineInterface): Promise<void> {
  await event($, { kind: 'approve' })
}

export async function changePipeline($: EngineInterface, note: string): Promise<void> {
  if (note.trim() === '') {
    $.ui.toast('Type what to change first.')
    return
  }
  const run = (await read($, pipeline)).run
  if (run?.steps.find(s => s.status === 'gate')?.id === 'review') {
    await fixPipeline($, note)
    return
  }
  await event($, { kind: 'change', note: note.trim() })
}

export async function retryPipeline($: EngineInterface): Promise<void> {
  await event($, { kind: 'retry' })
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

// The limit guard denied a call in the step's own subagent: the step is
// blocked when it needs that permission.
export async function onPipelineBlocked($: EngineInterface, note: string, limit: Limit, agentId?: string): Promise<void> {
  await update($, pipeline, p => {
    const run = p.run
    const step = run?.steps.find(s => s.status === 'running')
    if (!run || run.ended || run.blocked || !step || agentId === undefined || !run.agentIds?.includes(agentId) || !stopsStep(step.id, limit)) return p
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
  await apply($, run, e)
}

// Saves the run after an event, and starts the next step if there is one.
async function apply($: EngineInterface, run: PipeRun, e: PipeEvent) {
  const { run: next, next: index } = after({ ...run, prompt: null, agentIds: undefined, answers: undefined, spawning: undefined }, e)
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
  await sendStep($, run.steps[index]!.id === 'review' ? { ...run, findings: undefined, phase: undefined } : run, index)
}

// Sends the step to the chat as one prompt asking it to start the step's
// agent(s): one agent, the reviewers side by side, or the skeptic.
async function sendStep($: EngineInterface, run: PipeRun, index: number) {
  const step = run.steps[index]!
  const cards = await read($, deck)
  let prompt: string
  if (step.id === 'review' && run.phase === 'skeptic') {
    prompt = chatPrompt(typeOf('skeptic', cardsOf(cards)), skepticPrompt(stepHead(run, index), diffOf(run, index), (run.findings ?? []).filter(isSerious)))
  } else if (step.id === 'review') {
    const review = await reviewInputs($, run, index)
    if (typeof review === 'string') {
      await failAt($, run, index, review)
      return
    }
    const agents = review.names.map(name => ({ name, type: typeOf(name, cardsOf(cards)) }))
    prompt = reviewPrompt(stepHead(run, index), review.diffFile, review.untracked, agents, run.round ? fixesOf(run) : undefined)
  } else {
    if (step.agent !== null && !cards.some(c => c.agent.name === step.agent)) {
      await failAt($, run, index, `There is no ${step.agent} agent in the deck.`)
      return
    }
    // Checked again here: an agent picked mid-run skipped Start's check.
    const short = preflight([step], Object.fromEntries(cards.map(c => [c.agent.name, c.agent.limits])), localOf(cards))
    if (short.length) {
      await failAt($, run, index, `${shortfallText(short[0]!)} Pick an agent that can, then start again.`)
      return
    }
    if (step.id === 'build' && run.round && !(await $.fs.exists(fixesOf(run)))) {
      await failAt($, run, index, `The fixes file ${fixesOf(run)} is missing.`)
      return
    }
    prompt = chatPrompt(typeOf(step.agent, cardsOf(cards)), stepPrompt(run, index))
  }
  const before = step.id !== 'review' && editsFiles(run, index) ? await filesState($) : run.before
  const steps = run.steps.map((s, j) => (j === index ? { ...s, status: 'running' as const, summary: undefined, error: undefined } : s))
  await update($, pipeline, p => ({ ...p, run: { ...run, steps, prompt, before, blocked: undefined, agentIds: [], answers: {}, spawning: true } }))
  // The built-in agents are offered to the model until this turn ends.
  await update($, swarmOpen, () => prompt)
  // Later: this can run inside the last turn's turn.complete, which still holds the chat.
  await send($, prompt, true)
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
  const diff = await git($, ['git', 'diff', run.round ? (run.base ?? 'HEAD') : 'HEAD'])
  if (status === undefined || diff === undefined) return 'Couldn\'t read the diff with git.'
  const files = changedFiles(status)
  if (files.length === 0 && diff.trim() === '') return 'The diff is empty: nothing to review.'
  const diffFile = diffOf(run, index)
  await $.fs.write(diffFile, diff)
  const untracked = status.split(/\r?\n/).filter(l => l.startsWith('??')).map(l => l.slice(3))

  return { diffFile, untracked, names: reviewersFor(files, diff) }
}

// The reviewers' lines are in: merge them, then send the skeptic on the
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
  await sendStep($, { ...run, findings, phase: 'skeptic' }, index)
}

async function finishReview($: EngineInterface, run: PipeRun, index: number, findings: Finding[]) {
  const text = reportText(findings)
  await $.fs.write(fileOf(run, index), text)
  const steps = run.steps.map((s, j) => (j === index ? { ...s, summary: shortText(text, 20) } : s))
  const cap = run.cap ?? roundsCap(undefined)
  const next = run.round ? progress(run.previous ?? [], findings, run.round, cap) : undefined
  await apply($, { ...run, steps, findings, brake: next && brakeText(next, run.round!, cap) }, { kind: 'done', answer: text })
  if (next?.kind !== 'again') return
  const now = (await read($, pipeline)).run
  if (now && !now.ended) await fixRound($, now, '')
}

async function git($: EngineInterface, argv: string[]): Promise<string | undefined> {
  const ran = await $.process.run(argv).catch(() => undefined)
  return ran?.exitCode === 0 ? ran.stdout : undefined
}

// Agents on Local or Codex models: they answer only the main chat.
function localOf(cards: readonly DeckAgent[]): string[] {
  return cards.filter(c => routeOf(c.agent.model).kind === 'local' || routeOf(c.agent.model).kind === 'codex').map(c => c.agent.name)
}

function cardsOf(cards: readonly DeckAgent[]) {
  return cards.map(c => ({ name: c.agent.name, agentType: c.agentType }))
}

function diffOf(run: PipeRun, index: number): string {
  return fileOf(run, index).replace(/\.md$/, '.diff')
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
