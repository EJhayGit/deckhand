import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'

import { refreshDeck } from '../src/agents/library'
import { gatewayOptions } from '../src/gateway'
import { codexAnswer, localAnswer } from '../src/gatewayTurn'
import { COMMAND, runDeck } from '../src/commands'
import { blockedNote, blockingLimit, limitsFor, offText } from '../src/limits'
import { clearLoop, onMainTurnEnd, onPersonPrompt } from '../src/loop'
import { routeOf } from '../src/models'
import { current, isHiddenAgent, loopAgent, showStatus } from '../src/session'
import { onPipelineAgentEnd, onPipelineBlocked, onPipelineSpawn, onPipelineTurnEnd, pipelineSpawnTitle } from '../src/pipelineRun'
import { closeSwarm } from '../src/swarm'
import { PROGRESS_TOOL, onAgentEnd, onProgress, onSpawned, onStep } from '../src/tracker'
import { DECK, renderDeck } from '../src/ui/deck'
import { loadPins } from '../src/ui/skills'

const turnId = atom({ plugin: 'deckhand', key: 'turnId' } as const, null as string | null)

export const register: Register = (on, options) => {
  const gateway = gatewayOptions(options)
  // The person's text for this turn: turn.step does not carry it.
  let prompt = ''

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register(COMMAND)
    await $.tool.register(PROGRESS_TOOL).catch(() => undefined)
    await clearLoop($)
    await refreshDeck($)
    await loadPins($)
    await showStatus($)
    void $.ui.open(DECK)

    return started
  })

  on('command.run', { command: 'deck' }, async ($, e) => ({ text: await runDeck($, e.args) }))

  on('ui.render', { component: 'Pane', requestId: DECK.id }, ($, e) => renderDeck($, e))

  // The active agent's instructions, as one section at the end of the prompt.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const now = await current($)
    if (!now || now.card.agent.body.trim() === '') return composed
    const skills = now.card.agent.skills?.length ? `\n\nUse these skills when they apply: ${now.card.agent.skills.join(', ')}.` : ''
    const off = offText(now.chips.limits)
    const text = `You are working as the "${now.card.agent.name}" agent. Follow these instructions:\n\n${now.card.agent.body}${skills}${off ? `\n\n${off}` : ''}`

    return { sections: [...composed.sections, { id: 'deckhand:agent', text, scope: 'session' as const }] }
  })

  on('agent.offer', async ($, e, next) => ((await isHiddenAgent($, e.agent)) ? { isOffered: false } : next(e)))

  // Every agent that starts gets a row in the Runs view. A Pipeline step's
  // agent runs in the foreground, so its chat turn waits for it.
  on('agent.spawn', async ($, e, next) => {
    const step = e.resume ? undefined : await pipelineSpawnTitle($, e.parentAgentId, prompt, e.subagentType)
    const spawn = step ? { ...e, background: false, description: step } : e
    const started = await next(spawn)
    if (!started.deny && started.agentId && !e.resume) await onSpawned($, started.agentId, e.subagentType, spawn.description, started.model)
    if (step && !started.deny && started.agentId) await onPipelineSpawn($, started.agentId, e.parentAgentId, prompt)

    return started
  })

  on('tool.call', { tool: `mcp__deckhand__${PROGRESS_TOOL.name}` }, async ($, e) => ({ result: await onProgress($, e.agentId, e as unknown as Record<string, unknown>) }))

  // The person's own prompt starts a loop when a Repeat chip is picked.
  on('prompt.submit', async ($, e, next) => {
    const sent = await next(e)
    if (e.origin.kind === 'composer' && !('drop' in sent && sent.drop)) await onPersonPrompt($, e.text)

    return sent
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      await onMainTurnEnd($, e.reason)
      await closeSwarm($, prompt)
      await onPipelineTurnEnd($, prompt, e.reason)
    } else {
      await onAgentEnd($, e.agentId, e.reason)
      await onPipelineAgentEnd($, e.agentId, e.reason, e.answer)
    }

    return done
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      prompt = e.text
      await update($, turnId, () => e.turnId)
    }
    return next(e)
  })

  // Model and effort for the main loop only; subagents keep their own.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      const step = yield* next(e)
      if (step.usage) await onStep($, e.agentId, step.usage, step.usage.model)
      return step
    }
    const now = await current($)
    if (!now) return yield* next(e)
    const route = routeOf(now.chips.model)
    // Local and Codex: Deckhand answers the turn itself, in text, with no tool calls.
    if (route.kind === 'local' || route.kind === 'codex') {
      const answer = route.kind === 'local'
        ? await localAnswer($, gateway, now.card.agent, route.model, prompt)
        : await codexAnswer($, gateway, now.card.agent, now.chips.limits, prompt)
      yield { kind: 'text' as const, index: 0, text: answer }
      yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
      return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn' as const, usage: null }
    }
    const model = route.kind === 'claude' ? route.id : e.model
    const effort = now.chips.effort ?? e.effort

    return yield* next({ ...e, model, ...(effort === undefined ? {} : { effort }) })
  })

  // Limits hold on every tool call, subagents included: a deck subagent or a
  // Pipeline step keeps its own, any other loop the agent in use's. Fails closed.
  on('tool.call', async ($, e, next) => {
    const own = e.agentId === undefined ? undefined : await loopAgent($, e.agentId)
    const now = await current($)
    const who = limitsFor(own, now && { name: now.card.agent.name, limits: now.chips.limits })
    const limit = who ? blockingLimit(who.limits, e.tool) : undefined
    if (!who || !limit) return next(e)
    const note = blockedNote(who.name, e.tool, e as unknown as Record<string, unknown>, limit)
    $.ui.toast(note)
    $.ui.log(note)
    await onPipelineBlocked($, note, limit, e.agentId)

    return { deny: note }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'Deckhand blocked this call because its limit check failed.' }))
}
