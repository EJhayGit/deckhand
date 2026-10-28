// The active agent's chips, shown at the top of the Deck tab.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import type { Chips, Limits, Loop, RepeatMode } from '../../types'
import { agentText, refreshDeck, saveToLibrary, writeAgent } from '../agents/library'
import { CODEX_HINT, LOCAL_HINT } from '../gateway'
import { LIMIT_LABEL } from '../limits'
import { stopLoop } from '../loop'
import type { Limit } from '../limits'
import { routeOf } from '../models'
import { current, showStatus } from '../session'
import { EFFORT_CHIPS, MODEL_CHIPS, iconText } from './status'

const chips = atom({ plugin: 'deckhand', key: 'chips' } as const, null as Chips | null)
const repeat = atom({ plugin: 'deckhand', key: 'repeat' } as const, 'once' as RepeatMode)
const loop = atom({ plugin: 'deckhand', key: 'loop' } as const, null as Loop | null)

export const REPEAT_CHIPS: readonly { id: RepeatMode; label: string }[] = [
  { id: 'once', label: 'Once' },
  { id: 'x3', label: '3×' },
  { id: 'm10', label: '10 min' },
  { id: 'm30', label: '30 min' },
  { id: 'm60', label: '60 min' },
]

export async function renderChips($: EngineInterface, e: RenderInput) {
  const now = await current($)
  if (!now) return undefined
  const { Box, Text, Button } = $.ui.resolve(e)
  const { card, chips: on } = now
  const agent = card.agent
  const mode = await read($, repeat)
  const running = await read($, loop)
  const isChanged = on.model !== agent.model || on.effort !== agent.effort || JSON.stringify(on.limits) !== JSON.stringify(agent.limits)
  const chip = (key: string, label: string, isOn: boolean, press: () => unknown) => (
    <Button key={key} label={label} variant={isOn ? 'primary' : 'secondary'} dimColor={!isOn} onPress={() => void press()} />
  )

  // A fixed label column keeps every row's chips lined up.
  const row = (label: string, children: RenderChildren[]) => (
    <Box flexDirection="row" columnGap={1}>
      <Box width={8} flexShrink={0}><Text dimColor>{label}</Text></Box>
      <Box flexDirection="row" gap="xs" flexWrap="wrap" flexShrink={1}>{children}</Box>
    </Box>
  )

  return (
    <Box flexDirection="column" rowGap="xs" paddingX={1}>
      <Box flexDirection="row" columnGap={1}>
        <Text bold>{iconText(agent)} {agent.name}</Text>
        {running && <Button key="stop" label="Stop" onPress={() => void stopLoop($)} />}
        {isChanged && <Button key="save-chips" label="Save to agent" onPress={() => saveChips($)} />}
      </Box>
      {row('Model', MODEL_CHIPS.map(m => chip(`model-${m.id ?? 'default'}`, m.label, on.model === m.id || (m.id === 'local' && on.model?.startsWith('local:') === true), () => setChips($, { model: m.id }))))}
      {row('Effort', EFFORT_CHIPS.map(f => chip(`effort-${f.id}`, f.label, on.effort === f.id, () => setChips($, { effort: on.effort === f.id ? undefined : f.id }))))}
      {row('Can', (Object.keys(LIMIT_LABEL) as Limit[]).map(l => chip(`can-${l}`, LIMIT_LABEL[l], on.limits[l], () => setChips($, { limits: { ...on.limits, [l]: !on.limits[l] } as Limits }))))}
      {row('Repeat', REPEAT_CHIPS.map(r => chip(`repeat-${r.id}`, r.label, mode === r.id, () => update($, repeat, () => r.id))))}
      {routeOf(on.model).kind === 'local' && <Text dimColor>{LOCAL_HINT}</Text>}
      {routeOf(on.model).kind === 'codex' && <Text dimColor>{CODEX_HINT}</Text>}
    </Box>
  )
}

async function setChips($: EngineInterface, change: Partial<Chips>) {
  const now = await current($)
  if (!now) return
  await update($, chips, () => ({ ...now.chips, ...change }))
  await showStatus($)
}

async function saveChips($: EngineInterface) {
  const now = await current($)
  if (!now) return
  const agent = { ...now.card.agent, model: now.chips.model, effort: now.chips.effort, limits: now.chips.limits }
  if (now.card.source === 'library') {
    await saveToLibrary($, agent.name, agentText(agent, now.card.text))
  } else {
    await writeAgent($, agent, now.card.text)
  }
  await refreshDeck($)
  $.ui.toast(`Saved to ${agent.name}.`)
}
