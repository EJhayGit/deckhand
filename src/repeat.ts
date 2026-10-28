// The repeat loop as a state machine. Pure: no `$`; the caller owns the clock.
import type { Loop, RepeatMode } from '../types'

export const PERIOD_MS: Partial<Record<RepeatMode, number>> = { m10: 600_000, m30: 1_800_000, m60: 3_600_000 }
export const TIMES = 3

export type Step =
  | { loop: Loop; action: 'submit' }
  | { loop: Loop; action: 'wait'; ms: number }
  | { loop: null; action: 'stop'; why: 'done' | 'interrupted' | 'error' }
  | { loop: Loop | null; action: 'none' }

// The person's prompt starts a loop unless the mode is Once or one already runs.
export function start(mode: RepeatMode, prompt: string, running: Loop | null): Loop | null {
  if (mode === 'once' || running !== null) return running

  return { mode, prompt, run: 1, isInFlight: true }
}

export function afterTurn(loop: Loop, reason: 'answer' | 'aborted' | 'refusal' | 'error'): Step {
  if (reason === 'aborted') return { loop: null, action: 'stop', why: 'interrupted' }
  if (reason !== 'answer') return { loop: null, action: 'stop', why: 'error' }
  const period = PERIOD_MS[loop.mode]
  if (period !== undefined) return { loop: { ...loop, isInFlight: false }, action: 'wait', ms: period }
  if (loop.run >= TIMES) return { loop: null, action: 'stop', why: 'done' }

  return { loop: { ...loop, run: loop.run + 1, isInFlight: true }, action: 'submit' }
}

// A timer firing: never a second run while one is in flight.
export function tick(loop: Loop | null): Step {
  if (loop === null || loop.isInFlight) return { loop, action: 'none' }

  return { loop: { ...loop, run: loop.run + 1, isInFlight: true }, action: 'submit' }
}
