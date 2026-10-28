// The Swarm tab: pick a preset or agents, Parallel or Lead, type the task,
// Start.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { DeckAgent, SwarmDraft, SwarmMode } from '../../types'
import { PRESETS, startSwarm } from '../swarm'

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const swarm = atom({ plugin: 'deckhand', key: 'swarm' } as const, { preset: 'launch-kit', picked: Object.keys(PRESETS[0]!.parts), mode: 'parallel', task: '', note: null } as SwarmDraft)

const MODES: readonly { id: SwarmMode; label: string; hint: string }[] = [
  { id: 'parallel', label: 'Parallel', hint: 'Each picked agent starts now on its own part, in the background.' },
  { id: 'lead', label: 'Lead', hint: 'swarm-lead takes the task in the chat, splits it and hands parts to deck agents.' },
]

export async function renderSwarm($: EngineInterface, e: RenderInput) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const s = await read($, swarm)
  const cards = await read($, deck)
  const set = (change: Partial<SwarmDraft>) => update($, swarm, d => ({ ...d, ...change, note: null }))
  const chip = (key: string, label: string, isOn: boolean, press: () => unknown) => (
    <Button key={key} label={label} variant={isOn ? 'primary' : 'secondary'} dimColor={!isOn} onPress={() => void press()} />
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Text dimColor>Optional: run several agents on one task.</Text>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Text dimColor>Mode</Text>
        {MODES.map(m => chip(`mode-${m.id}`, m.label, s.mode === m.id, () => set({ mode: m.id })))}
      </Box>
      <Text dimColor>{MODES.find(m => m.id === s.mode)?.hint}</Text>
      {s.mode === 'parallel' && (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Text dimColor>Preset</Text>
            {PRESETS.map(p => chip(`preset-${p.id}`, p.label, s.preset === p.id, () => set({ preset: p.id, picked: Object.keys(p.parts) })))}
            {chip('preset-custom', 'Custom', s.preset === 'custom', () => set({ preset: 'custom' }))}
          </Box>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Text dimColor>Agents</Text>
            {cards.map(c => {
              const name = c.agent.name
              const isOn = s.picked.includes(name)
              return chip(`pick-${name}`, name, isOn, () => set({ preset: 'custom', picked: isOn ? s.picked.filter(n => n !== name) : [...s.picked, name] }))
            })}
          </Box>
        </Box>
      )}
      {'Input' in elements ? (
        <elements.Input key="swarm-task" label="Task" rows={3} placeholder="Launch our new pricing page" value={s.task} onInput={v => set({ task: v })} onSubmit={v => set({ task: v })} />
      ) : (
        <Text dimColor>Type the task on the desktop app or the terminal.</Text>
      )}
      {s.note && <Text color="warning">{s.note}</Text>}
      <Box flexDirection="row" gap={1}>
        <Button key="swarm-start" label={s.mode === 'lead' ? 'Start lead' : `Start ${s.picked.length} agents`} variant="primary" onPress={() => start($)} />
      </Box>
    </Box>
  )
}

async function start($: EngineInterface) {
  const s = await read($, swarm)
  const notes = await startSwarm($, s.mode, s.preset, s.picked, s.task)
  await update($, swarm, d => ({ ...d, note: notes.length ? notes.join(' ') : null }))
  if (notes.length) $.ui.toast(notes.join(' '))
}
