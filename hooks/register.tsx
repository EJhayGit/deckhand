import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

import { refreshDeck } from '../src/agents/library'
import { blockedNote, blockingLimit } from '../src/limits'
import { clearLoop, onMainTurnEnd, onPersonPrompt, stopLoop } from '../src/loop'
import { routeOf } from '../src/models'
import { current, showStatus } from '../src/session'
import { renderBand } from '../src/ui/band'
import { DECK, renderDeck } from '../src/ui/deck'

const turnId = atom({ plugin: 'deckhand', key: 'turnId' } as const, null as string | null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await clearLoop($)
    await refreshDeck($)
    await showStatus($)
    void $.ui.open(DECK)

    return started
  })

  on('ui.render', { component: 'Pane', requestId: DECK.id }, ($, e) => renderDeck($, e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const band = e.props.hasSurvey ? undefined : await renderBand($, e, () => stopLoop($))
    return band ?? next(e)
  })

  // The active agent's instructions, as one section at the end of the prompt.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const now = await current($)
    if (!now || now.card.agent.body.trim() === '') return composed
    const text = `You are working as the "${now.card.agent.name}" agent. Follow these instructions:\n\n${now.card.agent.body}`

    return { sections: [...composed.sections, { id: 'deckhand:agent', text, scope: 'session' as const }] }
  })

  // The person's own prompt starts a loop when a Repeat chip is picked.
  on('prompt.submit', async ($, e, next) => {
    const sent = await next(e)
    if (e.origin.kind === 'composer' && !('drop' in sent && sent.drop)) await onPersonPrompt($, e.text)

    return sent
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) await onMainTurnEnd($, e.reason)

    return done
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, turnId, () => e.turnId)
    return next(e)
  })

  // Model and effort for the main loop only; subagents keep their own.
  on('turn.step', async function* ($, e, next) {
    const now = e.agentId === undefined ? await current($) : undefined
    if (!now) return yield* next(e)
    const route = routeOf(now.chips.model)
    const model = route.kind === 'claude' ? route.id : e.model
    const effort = now.chips.effort ?? e.effort

    return yield* next({ ...e, model, ...(effort === undefined ? {} : { effort }) })
  })

  // Limits hold on every tool call, subagents included. Fails closed.
  on('tool.call', async ($, e, next) => {
    const now = await current($)
    const limit = now ? blockingLimit(now.chips.limits, e.tool) : undefined
    if (!now || !limit) return next(e)
    const note = blockedNote(now.card.agent.name, e.tool, e as unknown as Record<string, unknown>, limit)
    $.ui.toast(note)
    $.ui.log(note)

    return { deny: note }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'Deckhand blocked this call because its limit check failed.' }))
}
