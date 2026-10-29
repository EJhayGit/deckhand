// /deck and its subcommands.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { DeckAgent, RepeatMode } from '../types'
import { refreshDeck } from './agents/library'
import { LIMIT_LABEL } from './limits'
import type { Limit } from './limits'
import { stopLoop } from './loop'
import { current, useAgent, useNone } from './session'
import { PRESETS, startSwarm } from './swarm'
import { DECK } from './ui/deck'

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const repeat = atom({ plugin: 'deckhand', key: 'repeat' } as const, 'once' as RepeatMode)

export const COMMAND = {
  name: 'deck',
  description: 'Open the Deck, or: use <name>, none, repeat <3|10m|30m|60m|stop>, limits, swarm <preset> <task>',
  argumentHint: '[use <name> | none | repeat <3|10m|30m|60m|stop> | limits | swarm <launch-kit|security-sweep|ship-check> <task>]',
}

const REPEATS: Record<string, { mode: RepeatMode; text: string }> = {
  '3': { mode: 'x3', text: 'Your next prompt runs 3 times.' },
  '10m': { mode: 'm10', text: 'Your next prompt repeats every 10 minutes while this window is open.' },
  '30m': { mode: 'm30', text: 'Your next prompt repeats every 30 minutes while this window is open.' },
  '60m': { mode: 'm60', text: 'Your next prompt repeats every 60 minutes while this window is open.' },
}

export type DeckCommand =
  | { kind: 'open' }
  | { kind: 'use'; name: string }
  | { kind: 'none' }
  | { kind: 'repeat'; value: string }
  | { kind: 'limits' }
  | { kind: 'swarm'; preset: string; task: string }
  | { kind: 'help' }

// Pure: the words after /deck.
export function parseDeck(args: string): DeckCommand {
  const [word = '', ...rest] = args.trim().split(/\s+/).filter(w => w !== '')
  const tail = rest.join(' ')
  if (word === '') return { kind: 'open' }
  if (word === 'use' && tail !== '') return { kind: 'use', name: tail }
  if (word === 'none') return { kind: 'none' }
  if (word === 'repeat' && tail !== '') return { kind: 'repeat', value: tail }
  if (word === 'limits') return { kind: 'limits' }
  if (word === 'swarm' && rest.length >= 2) return { kind: 'swarm', preset: rest[0]!, task: rest.slice(1).join(' ') }

  return { kind: 'help' }
}

export async function runDeck($: EngineInterface, args: string): Promise<string> {
  const command = parseDeck(args)
  if (command.kind === 'open') {
    // Re-read the folder: agent files added after the session started show now.
    await refreshDeck($)
    await $.ui.open({ ...DECK, focus: true })
    return 'Deck opened.'
  }
  if (command.kind === 'use') {
    if (await useAgent($, command.name)) return `Using ${command.name}.`
    const names = (await read($, deck)).map(c => c.agent.name)
    return `No agent called ${command.name}. ${names.length ? `Agents: ${names.join(', ')}.` : 'The deck is empty.'}`
  }
  if (command.kind === 'none') {
    await useNone($)
    return 'No agent in use. Claude Code is back to normal.'
  }
  if (command.kind === 'repeat') {
    if (command.value === 'stop') {
      await stopLoop($)
      return 'Repeat stopped.'
    }
    const choice = REPEATS[command.value]
    if (!choice) return 'Repeat takes 3, 10m, 30m, 60m or stop.'
    await update($, repeat, () => choice.mode)
    return choice.text
  }
  if (command.kind === 'limits') {
    const now = await current($)
    if (!now) return 'No agent is in use, so nothing is limited.'
    const lines = (Object.keys(LIMIT_LABEL) as Limit[]).map(l => `${LIMIT_LABEL[l]}: ${now.chips.limits[l] ? 'on' : 'off'}`)
    return `${now.card.agent.name} can:\n${lines.join('\n')}`
  }
  if (command.kind === 'swarm') {
    const preset = PRESETS.find(p => p.id === command.preset)
    if (!preset) return `Swarm takes ${PRESETS.map(p => p.id).join(', ')}, then the task.`
    const names = Object.keys(preset.parts)
    const notes = await startSwarm($, command.preset, names, command.task, true)
    await $.ui.open({ ...DECK, focus: true })
    return notes.length ? notes.join(' ') : `Asked Claude to start ${preset.label}: ${names.join(', ')}.`
  }

  return `Usage: /deck ${COMMAND.argumentHint}`
}
