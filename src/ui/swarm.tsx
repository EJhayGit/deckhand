// The Swarm tab: Pipeline (a task through ordered steps with stops for your
// OK), Parallel (quick fan-out), and Lead under More.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { DeckAgent, PipeRun, PipeStep, Pipeline, SwarmDraft, SwarmMode } from '../../types'
import { KINDS, SIZES, STEP_LABEL, fileOf, gatesText, suggestKind, suggestSize } from '../pipeline'
import { approvePipeline, changePipeline, clearPipeline, fixFirstPipeline, startPipeline, stopPipeline } from '../pipelineRun'
import { PRESETS, startSwarm } from '../swarm'

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const swarm = atom({ plugin: 'deckhand', key: 'swarm' } as const, { preset: 'launch-kit', picked: Object.keys(PRESETS[0]!.parts), mode: 'pipeline', task: '', note: null } as SwarmDraft)
const pipeline = atom({ plugin: 'deckhand', key: 'pipeline' } as const, { kind: null, size: null, note: '', run: null, history: [] } as Pipeline)

const MODES: readonly { id: SwarmMode; label: string; hint: string }[] = [
  { id: 'pipeline', label: 'Pipeline', hint: 'Steps one after another, each building on the last, with stops for your OK.' },
  { id: 'parallel', label: 'Parallel', hint: 'Each picked agent starts now on its own part, in the background.' },
  { id: 'lead', label: 'Lead', hint: 'swarm-lead takes the task in the chat, splits it and hands parts to deck agents.' },
]

const STATUS: Record<PipeStep['status'], string> = { waiting: 'waiting', running: 'running', done: 'done', gate: 'needs OK', failed: 'failed' }
const STATUS_COLOR: Partial<Record<PipeStep['status'], string>> = { running: 'warning', done: 'success', gate: 'warning', failed: 'error' }
const STEP_ICON: Record<PipeStep['id'], string> = { research: '🔭', plan: '🗺️', tests: '✅', build: '🛠️', review: '🔍', commit: '📦' }

export async function renderSwarm($: EngineInterface, e: RenderInput) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const s = await read($, swarm)
  const p = await read($, pipeline)
  const cards = await read($, deck)
  const set = (change: Partial<SwarmDraft>) => update($, swarm, d => ({ ...d, ...change, note: null }))
  const chip = (key: string, label: string, isOn: boolean, press: () => unknown) => (
    <Button key={key} label={label} variant={isOn ? 'primary' : 'secondary'} dimColor={!isOn} onPress={() => void press()} />
  )
  const hasInput = 'Input' in elements
  const kind = p.kind ?? suggestKind(s.task)
  const size = p.size ?? suggestSize(s.task)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Text dimColor>Mode</Text>
        {MODES.filter(m => m.id !== 'lead').map(m => chip(`mode-${m.id}`, m.label, s.mode === m.id, () => set({ mode: m.id })))}
        <Text dimColor>More</Text>
        {chip('mode-lead', 'Lead', s.mode === 'lead', () => set({ mode: 'lead' }))}
      </Box>
      <Text dimColor>{MODES.find(m => m.id === s.mode)?.hint}</Text>
      {s.mode === 'pipeline' && p.run && renderRun($, e, p.run, p.note)}
      {!(s.mode === 'pipeline' && p.run) && (
        <Box flexDirection="column" gap={1}>
          {hasInput ? (
            <elements.Input key="swarm-task" label="Task" rows={3} placeholder="Fix the login redirect loop" value={s.task} onInput={v => set({ task: v })} onSubmit={v => set({ task: v })} />
          ) : (
            <Text dimColor>Type the task on the desktop app or the terminal.</Text>
          )}
          {s.mode === 'pipeline' && (
            <Box flexDirection="column" gap={1}>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Text dimColor>Kind</Text>
                {KINDS.map(k => chip(`kind-${k.id}`, k.label, kind === k.id, () => update($, pipeline, now => ({ ...now, kind: k.id }))))}
              </Box>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Text dimColor>Size</Text>
                {SIZES.map(z => chip(`size-${z.id}`, z.label, size === z.id, () => update($, pipeline, now => ({ ...now, size: z.id }))))}
              </Box>
              <Text dimColor>{gatesText(size)}</Text>
            </Box>
          )}
          {s.mode === 'parallel' && (
            <Box flexDirection="column" gap={1}>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Text dimColor>Preset</Text>
                {PRESETS.map(pr => chip(`preset-${pr.id}`, pr.label, s.preset === pr.id, () => set({ preset: pr.id, picked: Object.keys(pr.parts) })))}
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
          {s.note && <Text color="warning">{s.note}</Text>}
          <Box flexDirection="row" gap={1}>
            <Button key="swarm-start" label={s.mode === 'pipeline' ? 'Start' : s.mode === 'lead' ? 'Start lead' : `Start ${s.picked.length} agents`} variant="primary" onPress={() => start($)} />
          </Box>
        </Box>
      )}
    </Box>
  )
}

function renderRun($: EngineInterface, e: RenderInput, run: PipeRun, note: string) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const gate = run.steps.findIndex(s => s.status === 'gate')
  const kind = KINDS.find(k => k.id === run.kind)?.label
  const size = SIZES.find(z => z.id === run.size)?.label
  const hasConfirmed = run.steps[gate]?.id === 'review' && (run.findings ?? []).some(f => f.verdict === 'confirmed')

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold wrap="truncate-end">{kind} · {size} · {run.task}</Text>
      {run.steps.map((step, i) => (
        <Box key={`step-${i}`} flexDirection="column" borderStyle="round" borderColor={step.status === 'gate' ? 'warning' : undefined} paddingX={1}>
          <Box flexDirection="row" gap={1}>
            <Text>{STEP_ICON[step.id]} {i + 1}. {STEP_LABEL[step.id]}</Text>
            <Text dimColor>{step.agent ?? 'chat'}</Text>
            <Text color={STATUS_COLOR[step.status]}>{STATUS[step.status]}</Text>
          </Box>
          {(step.status === 'done' || step.status === 'gate') && <Text dimColor>{fileOf(run, i)}</Text>}
          {step.status === 'gate' && step.summary && <Text>{step.summary}</Text>}
          {step.error && <Text color="error">{step.error}</Text>}
        </Box>
      ))}
      {gate >= 0 && !run.ended && (
        <Box flexDirection="column" gap={1}>
          {'Input' in elements && <elements.Input key="pipeline-note" label="Change (optional)" placeholder="what to do differently" value={note} onInput={v => update($, pipeline, p => ({ ...p, note: v }))} onSubmit={v => update($, pipeline, p => ({ ...p, note: v }))} />}
          <Box flexDirection="row" gap={1}>
            {hasConfirmed && <Button key="pipeline-fix" label="Fix these first" variant="primary" onPress={() => fixFirstPipeline($)} />}
            <Button key="pipeline-approve" label="Approve" variant={hasConfirmed ? 'secondary' : 'primary'} onPress={() => approvePipeline($)} />
            <Button key="pipeline-change" label="Change" onPress={() => changePipeline($, note)} />
            <Button key="pipeline-stop" label="Stop" onPress={() => stopPipeline($)} />
          </Box>
        </Box>
      )}
      {gate < 0 && !run.ended && <Button key="pipeline-stop" label="Stop" onPress={() => stopPipeline($)} />}
      {run.ended && (
        <Box flexDirection="row" gap={1}>
          <Text color={run.ended === 'done' ? 'success' : run.ended === 'failed' ? 'error' : undefined}>
            {run.ended === 'done' ? 'Pipeline done.' : run.ended === 'stopped' ? 'Pipeline stopped.' : `Pipeline failed: ${run.error ?? 'a step failed.'}`}
          </Text>
          <Button key="pipeline-new" label="New pipeline" onPress={() => clearPipeline($)} />
        </Box>
      )}
    </Box>
  )
}

async function start($: EngineInterface) {
  const s = await read($, swarm)
  const p = await read($, pipeline)
  const notes = s.mode === 'pipeline'
    ? await startPipeline($, s.task, p.kind ?? suggestKind(s.task), p.size ?? suggestSize(s.task))
    : await startSwarm($, s.mode, s.preset, s.picked, s.task)
  await update($, swarm, d => ({ ...d, note: notes.length ? notes.join(' ') : null }))
  if (notes.length) $.ui.toast(notes.join(' '))
}
