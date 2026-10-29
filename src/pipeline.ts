// The Pipeline: a task through ordered steps, each building on the last one's
// result, with stops for the owner's OK. Pure: no `$`.
import type { Finding, Limits, PipeKind, PipeRun, PipeShortfall, PipeSize, PipeStep, PipeStepId, Run } from '../types'
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
  commit: ['run'],
}

// The deck's agents by name, with their limits.
export type Installed = Readonly<Record<string, Limits>>

// Each step has its own agent; the agent in use never runs a step.
const BUILDER = 'builder'
const BUG_FIXER = 'bug-fixer'
const COMMITTER = 'committer'

function can(limits: Limits | undefined, step: PipeStepId): boolean {
  return limits !== undefined && NEEDS[step].every(l => limits[l])
}

// A step's default agent (null: plain Claude Code), with a note when the
// default isn't installed. Build takes the builder (the bug-fixer for a Fix);
// Commit takes the committer.
export function agentFor(step: PipeStepId, size: PipeSize, kind: PipeKind, installed: Installed): { agent: string | null; note?: string } {
  if (step === 'commit') return can(installed[COMMITTER], step) ? { agent: COMMITTER } : { agent: null, note: 'No committer agent installed: plain Claude Code commits.' }
  if (step === 'build') {
    if (kind === 'fix' && can(installed[BUG_FIXER], step)) return { agent: BUG_FIXER }
    return can(installed[BUILDER], step) ? { agent: BUILDER } : { agent: null, note: 'No builder agent installed: plain Claude Code builds.' }
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

// A step as sent to the chat: start the step's agent and wait for it. The
// agent is named first, so auto mode sees the start was asked for. Deckhand
// reads the agent's own answer, so the chat only says Done.
export function chatPrompt(type: string, body: string): string {
  return `Start the \`${type}\` agent to run this Deckhand Pipeline step: one Agent call
(subagent_type \`${type}\`), not in the background, giving it the instructions
below exactly. Do none of the work yourself. When it has finished, reply
only: Done. Deckhand reads its answer itself.

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

// The findings a fix round's Build reads, beside Build's own result.
export function fixesOf(run: Pick<PipeRun, 'id' | 'steps'>): string {
  const build = run.steps.findIndex(s => s.id === 'build')
  return `${DIR}/${run.id}/${String(build + 1).padStart(2, '0')}-fixes.md`
}

export function fileOf(run: Pick<PipeRun, 'id' | 'steps'>, index: number): string {
  return `${DIR}/${run.id}/${String(index + 1).padStart(2, '0')}-${run.steps[index]!.id}.md`
}

// `overrides`: agents picked per step (null: plain Claude Code).
export function newPipeline(id: string, task: string, kind: PipeKind, size: PipeSize, owner: string | null, installed: Installed = {}, overrides: Partial<Record<PipeStepId, string | null>> = {}): PipeRun {
  const steps: PipeStep[] = stepsFor(size).map(step => {
    if (step in overrides) return { id: step, agent: overrides[step] ?? null, status: 'waiting' }
    const { agent, note } = agentFor(step, size, kind, installed)
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
  | { kind: 'fix'; previous: Finding[]; base?: string }
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
  // One fix round: Build again on the fixes file, then Review the new diff.
  if (event.kind === 'fix') {
    const from = run.steps.findIndex(s => s.id === 'build')
    const gate = at('gate')
    if (from < 0 || gate < 0 || run.steps[gate]!.id !== 'review') return { run, next: null }
    const steps = run.steps.map((s, j) => (j >= from ? { ...s, status: 'waiting' as const, summary: undefined } : s))
    return { run: { ...run, steps, note: undefined, findings: undefined, brake: undefined, previous: event.previous, base: event.base, round: (run.round ?? 0) + 1 }, next: from }
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
  research: 'Search the web for what this task needs: prior art, the docs and APIs involved, known pitfalls. Don\'t look for the code: the Plan step reads it. Answer with findings and dated sources.',
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
  // Commit is its own step after Review and the owner's OK; a commit here would
  // empty the diff Review reads.
  build: {
    feature: 'Build it, slice by slice, until the tests pass. Run the tests. Don\'t commit: the Commit step does that.',
    fix: 'Fix the root cause with the smallest change, so the failing test passes. Run the tests. Don\'t commit: the Commit step does that.',
    change: 'Make the change, slice by slice, until the tests pass. Run the tests. Don\'t commit: the Commit step does that.',
    cleanup: 'Clean up in small batches, running the tests after each. They must stay green. Don\'t commit: the Commit step does that.',
  },
  review: 'Review the change for real bugs and risks, most serious first. Change nothing.',
  commit: 'Commit the work: one commit per logical chunk, with messages in the style of this repo\'s git log. Don\'t push.',
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
  if (step.id === 'build' && run.round) {
    return `${stepHead(run, index)}

Fix round ${run.round}/${run.cap ?? run.round}. Read ${fixesOf(run)} and fix only the items in it,
with the smallest change. Run the tests. Don't commit: the Commit step does that.

Do only this step. Your final answer is the step's result: Deckhand saves it
to ${fileOf(run, index)} for the next step.
`
  }
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

// Tokens and cost per fix round of one step, from the Runs rows tagged like
// `Round 2/3 · Build`. Rows from before this run started don't count.
export function roundTotals(rows: readonly Pick<Run, 'title' | 'tokens' | 'cost' | 'startedAt'>[], run: Pick<PipeRun, 'id' | 'round'>, step: PipeStepId): { round: number; tokens: number; cost: number }[] {
  const m = /^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)$/.exec(run.id)
  const since = m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) : 0
  return Array.from({ length: run.round ?? 0 }, (_, i) => {
    const of = rows.filter(r => r.startedAt >= since && r.title.startsWith(`Round ${i + 1}/`) && r.title.includes(`· ${STEP_LABEL[step]}`))
    return { round: i + 1, tokens: of.reduce((n, r) => n + r.tokens, 0), cost: of.reduce((n, r) => n + r.cost, 0) }
  })
}
