// The Runs view's numbers: one record per agent loop, its usage, cost and
// time. Pure: no `$`.
import type { Effort, Hat, Run } from '../types'
import { CONTEXT_TOKENS, priceOf } from './models'

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type RunStart = { agentId: string; title: string; name: string; model: string; effort?: Effort; color?: string; hat?: Hat }

export function newRun(s: RunStart, now: number): Run {
  return { ...s, hat: s.hat ?? 'none', startedAt: now, status: 'running', tokens: 0, cost: 0, lastInput: 0 }
}

// Cost adds up per request; tokens and context show the latest request, as the
// conversation is re-read each step.
export function addUsage(run: Run, usage: Usage, model: string): Run {
  const input = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  return { ...run, model, lastInput: input, tokens: input + usage.output_tokens, cost: run.cost + costOf(model, usage) }
}

export function costOf(model: string, u: Usage): number {
  const p = priceOf(model)
  if (!p) return 0
  const dollars = u.input_tokens * p.input + u.output_tokens * p.output + u.cache_read_input_tokens * p.cacheRead + u.cache_creation_input_tokens * p.input * 1.25

  return dollars / 1_000_000
}

export function endRun(run: Run, reason: 'answer' | 'aborted' | 'refusal' | 'error', now: number): Run {
  if (run.status !== 'running') return run
  return { ...run, status: reason === 'answer' ? 'done' : 'failed', endedAt: now }
}

export function setSteps(run: Run, done: number, total: number): Run {
  const t = Math.max(1, Math.round(total))
  return { ...run, steps: { done: Math.min(t, Math.max(0, Math.round(done))), total: t } }
}

// 0..1 for the bar: finished is full; running shows its steps, or a sliver.
export function progressOf(run: Run): number {
  if (run.status !== 'running') return 1
  if (run.steps) return Math.max(0.05, run.steps.done / run.steps.total)
  return 0.05
}

export function ctxPercent(run: Run): number {
  return Math.round((run.lastInput / CONTEXT_TOKENS) * 100)
}

export function elapsed(run: Run, now: number): number {
  return (run.endedAt ?? now) - run.startedAt
}

export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`
}

export function tokensText(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export function costText(dollars: number): string {
  return `≈$${dollars.toFixed(2)}`
}

// The header tiles: summed cost and tokens, and wall time from the first start
// to the last end (or now).
export function totals(runs: readonly Run[], now: number): { cost: number; tokens: number; ms: number } {
  if (runs.length === 0) return { cost: 0, tokens: 0, ms: 0 }
  const start = Math.min(...runs.map(r => r.startedAt))
  const end = Math.max(...runs.map(r => r.endedAt ?? now))

  return { cost: runs.reduce((a, r) => a + r.cost, 0), tokens: runs.reduce((a, r) => a + r.tokens, 0), ms: end - start }
}
