// Runs the repeat loop: resends the prompt, keeps the timer, and stops it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Loop, RepeatMode } from '../types'
import { afterTurn, start, tick } from './repeat'
import type { Step } from './repeat'
import { showStatus } from './session'

const repeat = atom({ plugin: 'deckhand', key: 'repeat' } as const, 'once' as RepeatMode)
const loop = atom({ plugin: 'deckhand', key: 'loop' } as const, null as Loop | null)
const turnId = atom({ plugin: 'deckhand', key: 'turnId' } as const, null as string | null)

// The module's own: a reload cancels the timer, and session.start clears the loop.
let timer: { cancel: () => void } | undefined

const STOPPED = { done: 'Loop done.', interrupted: 'Loop stopped: the turn was interrupted.', error: 'Loop stopped: the turn ended with an error.' }

export async function onPersonPrompt($: EngineInterface, text: string): Promise<void> {
  const mode = await read($, repeat)
  const running = await read($, loop)
  const next = start(mode, text, running)
  if (next === running) return
  await update($, loop, () => next)
  await showStatus($)
}

export async function onMainTurnEnd($: EngineInterface, reason: 'answer' | 'aborted' | 'refusal' | 'error'): Promise<void> {
  const running = await read($, loop)
  if (running === null) return
  await apply($, afterTurn(running, reason))
}

export async function stopLoop($: EngineInterface): Promise<void> {
  const running = await read($, loop)
  timer?.cancel()
  timer = undefined
  await update($, loop, () => null)
  await update($, repeat, () => 'once' as RepeatMode)
  if (running?.isInFlight) {
    const id = await read($, turnId)
    if (id !== null) await $.turn.abort({ turnId: id }).catch(() => undefined)
  }
  await showStatus($)
  if (running) $.ui.toast('Loop stopped.')
}

export async function clearLoop($: EngineInterface): Promise<void> {
  timer?.cancel()
  timer = undefined
  await update($, loop, () => null)
}

async function apply($: EngineInterface, step: Step): Promise<void> {
  await update($, loop, () => step.loop)
  if (step.action === 'submit') {
    await $.prompt.submit({ text: step.loop.prompt, asUser: true })
  } else if (step.action === 'wait') {
    timer?.cancel()
    timer = $.clock.after(step.ms, () => {
      timer = undefined
      void (async () => apply($, tick(await read($, loop))))()
    })
  } else if (step.action === 'stop') {
    timer?.cancel()
    timer = undefined
    await update($, repeat, () => 'once' as RepeatMode)
    $.ui.toast(STOPPED[step.why])
  }
  await showStatus($)
}
