// The Pipeline: a task through ordered steps, each building on the last one's
// result, with stops for the owner's OK. Pure: no `$`.
import type { PipeKind, PipeRun, PipeSize, PipeStep, PipeStepId } from '../types'

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

// Security and public-API work is never smaller than Normal.
const RISKY = /\b(api|auth\w*|login|password|secret|token|permission\w*|migrat\w*|security|crypto|payment\w*|schema|public)\b/i
const FILE = /\b[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|cs|css|html|md|json|ya?ml|sql)\b/gi

export function suggestSize(task: string): PipeSize {
  const files = new Set(task.match(FILE) ?? []).size
  const words = task.trim().split(/\s+/).filter(Boolean).length
  let size: PipeSize = words <= 12 && files <= 1 ? 'tiny' : words <= 40 && files <= 3 ? 'small' : words <= 120 && files <= 8 ? 'normal' : 'big'
  if (RISKY.test(task) && (size === 'tiny' || size === 'small')) size = 'normal'

  return size
}

export function suggestKind(task: string): PipeKind {
  if (/\b(fix\w*|bug\w*|broken|crash\w*|error\w*|fail\w*|wrong|regression)\b/i.test(task)) return 'fix'
  if (/\b(clean\w*|refactor\w*|tidy|dead code|simplif\w*|remove unused)\b/i.test(task)) return 'cleanup'
  if (/\b(change|rename|replace|update|move|switch|upgrade)\b/i.test(task)) return 'change'

  return 'feature'
}

export function stepsFor(size: PipeSize): readonly PipeStepId[] {
  return STEPS[size]
}

// Build and Commit run in the main chat with the agent the owner had in use
// (null: plain Claude Code). The rest use a deck agent.
export function agentFor(step: PipeStepId, size: PipeSize, owner: string | null): string | null {
  if (step === 'research') return 'researcher'
  if (step === 'plan') return size === 'big' ? 'architect' : 'planner'
  if (step === 'tests') return 'test-writer'
  if (step === 'review') return 'reviewer'

  return owner
}

export function runId(now: number): string {
  return new Date(now).toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-')
}

export function fileOf(run: Pick<PipeRun, 'id' | 'steps'>, index: number): string {
  return `${DIR}/${run.id}/${String(index + 1).padStart(2, '0')}-${run.steps[index]!.id}.md`
}

export function newPipeline(id: string, task: string, kind: PipeKind, size: PipeSize, owner: string | null): PipeRun {
  const steps: PipeStep[] = stepsFor(size).map(step => ({ id: step, agent: agentFor(step, size, owner), status: 'waiting' }))

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
    const steps = run.steps.map((s, j) => (j >= from ? { ...s, status: 'waiting' as const } : s))
    return { run: { ...run, steps, note: event.note }, next: from }
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

export function stepPrompt(run: PipeRun, index: number): string {
  const step = run.steps[index]!
  const total = run.steps.length
  const earlier = run.steps.slice(0, index).map((s, i) => (s.status === 'done' ? `- ${fileOf(run, i)}` : '')).filter(Boolean)
  const todo = typeof DO[step.id] === 'string' ? DO[step.id] as string : (DO[step.id] as Record<PipeKind, string>)[run.kind]
  const note = run.note ? `\n\nThe owner asked for a change: ${run.note}\nRedo this step with it.` : ''

  return `Deckhand pipeline ${run.id}, step ${index + 1}/${total}: ${STEP_LABEL[step.id]}.

Task:
${run.task}

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
