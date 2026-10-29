// The Pipeline: a task through ordered steps, each building on the last one's
// result, with stops for the owner's OK. Pure: no `$`.
import type { Limits, PipeKind, PipeRun, PipeShortfall, PipeSize, PipeStep, PipeStepId } from '../types'
import { LIMIT_LABEL } from './limits'
import type { Limit } from './limits'

export const DIR = '.deckhand/pipeline'
export const KEEP = 20

export const KINDS: readonly { id: PipeKind; label: string }[] = [
  { id: 'feature', label: 'Feature' },
  { id: 'fix', label: 'Fix' },
  { id: 'change', label: 'Change' },
  { id: 'cleanup', label: 'Clean up' },
]

export const SIZES: readonly { id: PipeSize; label: string }[] = [
  { id: 'tiny', label: 'Tiny' },
  { id: 'small', label: 'Small' },
  { id: 'normal', label: 'Normal' },
  { id: 'big', label: 'Big' },
]

export const STEP_LABEL: Record<PipeStepId, string> = {
  research: 'Research',
  plan: 'Plan',
  tests: 'Tests',
  build: 'Build',
  review: 'Review',
  commit: 'Commit',
}

const STEPS: Record<PipeSize, readonly PipeStepId[]> = {
  tiny: ['build', 'review', 'commit'],
  small: ['tests', 'build', 'review', 'commit'],
  normal: ['plan', 'tests', 'build', 'review', 'commit'],
  big: ['research', 'plan', 'tests', 'build', 'review', 'commit'],
}

// Auto: Kind and Size guessed from the task's words, no model call. Rules are
// checked in order and the first match wins; each guess says why.
export type Guess<T> = { value: T; reason?: string }

const FILE = /\b[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|cs|css|html|md|json|ya?ml|sql)\b/gi

const KIND_RULES: readonly [PipeKind, RegExp][] = [
  ['fix', /\b(fix(?:es|ed|ing)?|bugs?|broken|errors?|crash(?:es|ed|ing)?)\b/i],
  ['feature', /\b(add(?:s|ed|ing)?|new|supports?)\b/i],
  ['change', /\b(change[sd]?|make it|instead)\b/i],
  ['cleanup', /\b(clean(?:s|ed|ing)?|refactor(?:s|ed|ing)?|tidy|rename[sd]?)\b/i],
]
// Big beats Normal beats Tiny: security work is never Tiny.
const BIG = /\b(redesign\w*|rewrite|rewriting|new system)\b/i
const RISKY = /\b(auth\w*|login|security|secrets?|api|migrat\w*|database|payments?)\b/i
const TINY = /\b(typo|rename|copy|one[- ]line)\b/i

export function filesIn(text: string): number {
  return new Set((text.match(FILE) ?? []).map(f => f.toLowerCase())).size
}

export function guessKind(task: string): Guess<PipeKind> {
  for (const [kind, rule] of KIND_RULES) {
    const hit = task.match(rule)
    if (hit) return { value: kind, reason: `says "${hit[0].toLowerCase()}"` }
  }

  return { value: 'feature' }
}

export function guessSize(task: string): Guess<PipeSize> {
  const files = filesIn(task)
  const words = task.trim().split(/\s+/).filter(Boolean).length
  const big = task.match(BIG)
  if (big) return { value: 'big', reason: `says "${big[0].toLowerCase()}"` }
  if (files >= 6) return { value: 'big', reason: `names ${files} files` }
  const risky = task.match(RISKY)
  if (risky) return { value: 'normal', reason: `mentions ${risky[0].toLowerCase()}` }
  if (files >= 2) return { value: 'normal', reason: `names ${files} files` }
  const tiny = task.match(TINY)
  if (tiny) return { value: 'tiny', reason: `says "${tiny[0].toLowerCase()}"` }
  if (words > 0 && words < 12 && files === 0) return { value: 'small', reason: 'short task' }

  return { value: 'small' }
}

// The line under the chips, for the rows on Auto (null); undefined when none is.
export function autoText(task: string, kind: PipeKind | null, size: PipeSize | null): string | undefined {
  const k = guessKind(task)
  const z = guessSize(task)
  const guesses = [
    ...(kind === null ? [{ ...k, label: KINDS.find(x => x.id === k.value)!.label }] : []),
    ...(size === null ? [{ ...z, label: SIZES.find(x => x.id === z.value)!.label }] : []),
  ]
  if (guesses.length === 0) return undefined
  const reasons = guesses.map(g => g.reason).filter(Boolean)

  return `Auto: ${guesses.map(g => g.label).join(' · ')}${reasons.length ? ` (${reasons.join(', ')})` : ''}`
}

// After Plan: a Normal plan naming 6+ files is Big work. Only Normal and Big
// have a Plan step, so Normal -> Big is the only bump.
export function planBump(size: PipeSize, plan: string): { size: PipeSize; note: string } | undefined {
  const files = filesIn(plan)
  return size === 'normal' && files >= 6 ? { size: 'big', note: `Size bumped to Big: the plan names ${files} files.` } : undefined
}

export function stepsFor(size: PipeSize): readonly PipeStepId[] {
  return STEPS[size]
}

// What each step's agent must be allowed to do. Plain Claude Code (null) can
// do all of it.
export const NEEDS: Record<PipeStepId, readonly Limit[]> = {
  research: ['internet'],
  plan: [],
  tests: ['edit', 'run'],
  build: ['edit', 'run'],
  review: [],
  commit: ['edit', 'run'],
}

// The deck's agents by name, with their limits.
export type Installed = Readonly<Record<string, Limits>>

// Build falls back to these, in order, when the agent in use can't edit and run.
const FIXERS = ['fixer', 'bug-fixer']

function can(limits: Limits | undefined, step: PipeStepId): boolean {
  return limits !== undefined && NEEDS[step].every(l => limits[l])
}

// A step's default agent (null: plain Claude Code), with a note when the
// default isn't installed. Build takes the agent in use if it can edit and
// run, else a fixer; Commit is always plain Claude Code.
export function agentFor(step: PipeStepId, size: PipeSize, owner: string | null, installed: Installed): { agent: string | null; note?: string } {
  if (step === 'commit') return { agent: null }
  if (step === 'build') {
    if (owner !== null && can(installed[owner], step)) return { agent: owner }
    const fixer = FIXERS.find(name => can(installed[name], step))
    return fixer ? { agent: fixer } : { agent: null, note: 'No fixer agent installed: plain Claude Code builds.' }
  }
  const want = step === 'research' ? 'researcher' : step === 'plan' ? (size === 'big' ? 'architect' : 'planner') : step === 'tests' ? 'test-writer' : 'reviewer'

  return installed[want] ? { agent: want } : { agent: null, note: `No ${want} agent installed: plain Claude Code runs this step.` }
}

// Steps whose agent lacks a permission the step needs, or can't run as a
// subagent (`local`: agents on Local or Codex models, which answer only the
// main chat).
export function preflight(steps: readonly PipeStep[], installed: Installed, local: readonly string[] = []): PipeShortfall[] {
  return steps.flatMap(s => {
    if (s.agent === null) return []
    if (local.includes(s.agent)) return [{ step: s.id, agent: s.agent, missing: [], reason: 'runs on a Local or Codex model and can\'t run as a subagent.' }]
    const limits = installed[s.agent]
    const missing = NEEDS[s.id].filter(l => limits?.[l] !== true)
    return missing.length ? [{ step: s.id, agent: s.agent, missing }] : []
  })
}

export function shortfallText(s: PipeShortfall): string {
  if (s.reason) return `${STEP_LABEL[s.step]}: ${s.agent} ${s.reason}`
  return `${STEP_LABEL[s.step]}: ${s.agent} is missing ${s.missing.map(l => LIMIT_LABEL[l]).join(', ')}.`
}

// A picked agent for one step, for this run only.
export function withAgent(run: PipeRun, step: PipeStepId, agent: string | null): PipeRun {
  return { ...run, steps: run.steps.map(s => (s.id === step && s.status !== 'done' ? { ...s, agent, note: undefined } : s)) }
}

// The subagent type a step spawns: its deck card's, plain Claude Code as
// general-purpose.
export function typeOf(agent: string | null, cards: readonly { name: string; agentType?: string }[]): string {
  if (agent === null) return 'general-purpose'
  return cards.find(c => c.name === agent)?.agentType ?? `deckhand:${agent}`
}

// Send through chat: asks the main chat to start the step's subagent, for
// when Claude Code refused Deckhand's own start.
export function chatPrompt(type: string, body: string): string {
  return `Start the \`${type}\` agent now with one Agent call (subagent_type \`${type}\`), giving it
the instructions below exactly. Do none of the work yourself. When it
finishes, your whole final answer is its final answer, unchanged.

${body}`
}

// Steps that must change files: Tests (except a clean-up's) and Build.
export function editsFiles(run: Pick<PipeRun, 'kind' | 'steps'>, index: number): boolean {
  const id = run.steps[index]?.id
  return id === 'build' || (id === 'tests' && run.kind !== 'cleanup')
}

// The limit guard's note, quoted in a step's answer, when it blocked a
// permission the step needs. A read-only step trying to edit isn't blocked.
export function blockedIn(answer: string, step: PipeStepId): string | undefined {
  const hit = answer.match(/Blocked: [^\n]*?, but ([^\n]*?) is off for this agent\./)
  return hit && stopsStep(step, (Object.keys(LIMIT_LABEL) as Limit[]).find(l => LIMIT_LABEL[l] === hit[1])) ? hit[0] : undefined
}

export function stopsStep(step: PipeStepId, limit: Limit | undefined): boolean {
  return limit !== undefined && NEEDS[step].includes(limit)
}

export function runId(now: number): string {
  return new Date(now).toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-')
}

export function fileOf(run: Pick<PipeRun, 'id' | 'steps'>, index: number): string {
  return `${DIR}/${run.id}/${String(index + 1).padStart(2, '0')}-${run.steps[index]!.id}.md`
}

// `overrides`: agents picked per step (null: plain Claude Code).
export function newPipeline(id: string, task: string, kind: PipeKind, size: PipeSize, owner: string | null, installed: Installed = {}, overrides: Partial<Record<PipeStepId, string | null>> = {}): PipeRun {
  const steps: PipeStep[] = stepsFor(size).map(step => {
    if (step in overrides) return { id: step, agent: overrides[step] ?? null, status: 'waiting' }
    const { agent, note } = agentFor(step, size, owner, installed)
    return { id: step, agent, status: 'waiting', ...(note ? { note } : {}) }
  })

  return { id, task, kind, size, owner, steps, prompt: null }
}

// The owner's OK comes after Plan and before Commit.
export function stopsAfter(run: Pick<PipeRun, 'steps'>, index: number): boolean {
  return run.steps[index]?.id === 'plan' || run.steps[index + 1]?.id === 'commit'
}

export function gatesText(size: PipeSize): string {
  const steps = stepsFor(size)
  const stops = [...(steps.includes('plan') ? ['after Plan'] : []), 'before Commit']

  return `${steps.map(s => STEP_LABEL[s]).join(' → ')} · stops for your OK ${stops.join(', ')}`
}

export type PipeEvent =
  | { kind: 'done'; answer: string }
  | { kind: 'failed'; error: string }
  | { kind: 'approve' }
  | { kind: 'change'; note: string }
  | { kind: 'redo'; from: PipeStepId; note: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'retry' }
  | { kind: 'stop' }

// The run after an event, and the step to start next (none: wait or ended).
export function after(run: PipeRun, event: PipeEvent): { run: PipeRun; next: number | null } {
  const at = (status: PipeStep['status']) => run.steps.findIndex(s => s.status === status)
  const set = (i: number, change: Partial<PipeStep>) => run.steps.map((s, j) => (j === i ? { ...s, ...change } : s))
  const onward = (steps: PipeStep[], i: number) => (i + 1 < steps.length ? { run: { ...run, steps, note: undefined }, next: i + 1 } : { run: { ...run, steps, note: undefined, ended: 'done' as const }, next: null })

  if (event.kind === 'done') {
    const i = at('running')
    if (i < 0) return { run, next: null }
    if (stopsAfter(run, i)) return { run: { ...run, steps: set(i, { status: 'gate' }) }, next: null }
    return onward(set(i, { status: 'done' }), i)
  }
  if (event.kind === 'failed') {
    const i = at('running')
    return { run: { ...run, steps: i < 0 ? run.steps : set(i, { status: 'failed', error: event.error }), ended: 'failed', error: event.error }, next: null }
  }
  // Blocked: the run waits at that step for Retry, another agent, or Stop.
  if (event.kind === 'blocked') {
    const i = at('running')
    return i < 0 ? { run, next: null } : { run: { ...run, steps: set(i, { status: 'blocked', error: event.reason }), blocked: undefined }, next: null }
  }
  if (event.kind === 'retry') {
    const i = at('blocked')
    return i < 0 ? { run, next: null } : { run: { ...run, steps: set(i, { status: 'waiting', error: undefined }) }, next: i }
  }
  if (event.kind === 'approve') {
    const i = at('gate')
    return i < 0 ? { run, next: null } : onward(set(i, { status: 'done' }), i)
  }
  if (event.kind === 'change') {
    const i = at('gate')
    return i < 0 ? { run, next: null } : { run: { ...run, steps: set(i, { status: 'waiting' }), note: event.note }, next: i }
  }
  if (event.kind === 'redo') {
    const from = run.steps.findIndex(s => s.id === event.from)
    if (from < 0 || at('gate') < 0) return { run, next: null }
    const steps = run.steps.map((s, j) => (j >= from ? { ...s, status: 'waiting' as const, summary: undefined } : s))
    return { run: { ...run, steps, note: event.note, findings: undefined }, next: from }
  }

  return { run: { ...run, ended: 'stopped' }, next: null }
}

const FIRST: Record<PipeKind, string> = {
  feature: 'This is a new feature.',
  fix: 'This is a bug fix: it starts with a failing test that reproduces the bug.',
  change: 'This changes existing behavior: keep everything else working.',
  cleanup: 'This is a clean-up: behavior must not change, and the tests must stay green throughout.',
}

const DO: Record<PipeStepId, Record<PipeKind, string> | string> = {
  research: 'Research what this task needs: prior art, the docs and APIs involved, pitfalls. Change nothing. Answer with findings and dated sources.',
  plan: {
    feature: 'Make the plan: a numbered task list of thin slices, each naming its files and how to check it. Change nothing.',
    fix: 'Make the plan: first the failing test that reproduces the bug, then the root cause, then a numbered list of thin fix slices with files and checks. Change nothing.',
    change: 'Make the plan: a numbered task list of thin slices, each naming its files, what keeps working, and how to check it. Change nothing.',
    cleanup: 'Make the plan: a numbered list of small clean-up batches, each keeping the tests green, with files and checks. Change nothing.',
  },
  tests: {
    feature: 'Write the tests for the planned behavior first. Run them: they should fail until Build. Don\'t write the feature.',
    fix: 'Write a failing test that reproduces the bug. Run it and show it fails. Don\'t fix the bug yet.',
    change: 'Write or update tests for the new behavior first. Run them: the new ones should fail until Build.',
    cleanup: 'Run the tests and note the result. Where coverage is thin, add tests that pin the current behavior. Everything must pass.',
  },
  build: {
    feature: 'Build it, slice by slice, until the tests pass. Run the tests.',
    fix: 'Fix the root cause with the smallest change, so the failing test passes. Run the tests.',
    change: 'Make the change, slice by slice, until the tests pass. Run the tests.',
    cleanup: 'Clean up in small batches, running the tests after each. They must stay green.',
  },
  review: 'Review the change for real bugs and risks, most serious first. Change nothing.',
  commit: 'Commit the work: one commit per logical chunk, with plain messages. Don\'t push.',
}

export function stepHead(run: PipeRun, index: number): string {
  return `Deckhand pipeline ${run.id}, step ${index + 1}/${run.steps.length}: ${STEP_LABEL[run.steps[index]!.id]}.

Task:
${run.task}`
}

export function stepPrompt(run: PipeRun, index: number): string {
  const step = run.steps[index]!
  const earlier = run.steps.slice(0, index).map((s, i) => (s.status === 'done' ? `- ${fileOf(run, i)}` : '')).filter(Boolean)
  const todo = typeof DO[step.id] === 'string' ? DO[step.id] as string : (DO[step.id] as Record<PipeKind, string>)[run.kind]
  const note = run.note ? `\n\nThe owner asked for a change: ${run.note}\nRedo this step with it.` : ''

  return `${stepHead(run, index)}

${FIRST[run.kind]}${earlier.length ? `\n\nRead the earlier results first:\n${earlier.join('\n')}` : ''}

${todo}${note}

Do only this step. Your final answer is the step's result: Deckhand saves it
to ${fileOf(run, index)} for the next step.
`
}

// The start of a result, for a card.
export function shortText(text: string, lines = 12): string {
  const all = text.trim().split(/\r?\n/)
  return all.length > lines ? `${all.slice(0, lines).join('\n')}\n…` : all.join('\n')
}
