// The Swarm tab: Pipeline (a task through ordered steps with stops for your
// OK) and Parallel (quick fan-out).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { DeckAgent, PipeRun, PipeStep, PipeStepId, Pipeline, SwarmDraft, SwarmMode } from '../../types'
import { KINDS, SIZES, STEP_LABEL, autoText, fileOf, gatesText, guessKind, guessSize, newPipeline, shortfallText } from '../pipeline'
import { approvePipeline, changePipeline, clearPipeline, fixFirstPipeline, pickAgent, pickStep, retryPipeline, startPipeline, stopPipeline } from '../pipelineRun'
import { PRESETS, startSwarm } from '../swarm'

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const swarm = atom({ plugin: 'deckhand', key: 'swarm' } as const, { preset: 'launch-kit', picked: Object.keys(PRESETS[0]!.parts), mode: 'pipeline', task: '', note: null } as SwarmDraft)
const pipeline = atom({ plugin: 'deckhand', key: 'pipeline' } as const, { kind: null, size: null, note: '', run: null, history: [] } as Pipeline)
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)

const MODES: readonly { id: SwarmMode; label: string; hint: string }[] = [
  { id: 'pipeline', label: 'Pipeline', hint: 'Steps one after another, each building on the last, with stops for your OK.' },
  { id: 'parallel', label: 'Parallel', hint: 'Each picked agent starts now on its own part, in the background.' },
]

const STATUS: Record<PipeStep['status'], string> = { waiting: 'waiting', running: 'running', done: 'done', gate: 'needs OK', failed: 'failed', blocked: 'blocked' }
const STATUS_COLOR: Partial<Record<PipeStep['status'], string>> = { running: 'warning', done: 'success', gate: 'warning', failed: 'error', blocked: 'error' }
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
  // A draft saved while Lead existed opens as Pipeline.
  const mode: SwarmMode = s.mode === 'parallel' ? 'parallel' : 'pipeline'
  const size = p.size ?? guessSize(s.task).value
  const auto = autoText(s.task, p.kind, p.size)
  const installed = Object.fromEntries(cards.map(c => [c.agent.name, c.agent.limits]))
  const preview = newPipeline('preview', s.task, p.kind ?? guessKind(s.task).value, size, await read($, active), installed, p.agents ?? {})

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Text dimColor>Mode</Text>
        {MODES.map(m => chip(`mode-${m.id}`, m.label, mode === m.id, () => set({ mode: m.id })))}
      </Box>
      <Text dimColor>{MODES.find(m => m.id === mode)?.hint}</Text>
      {mode === 'pipeline' && p.run && renderRun($, e, p.run, p.note, cards, p.picking ?? null)}
      {!(mode === 'pipeline' && p.run) && (
        <Box flexDirection="column" gap={1}>
          {hasInput ? (
            <elements.Input key="swarm-task" label="Task" rows={3} placeholder="Fix the login redirect loop" value={s.task} onInput={v => set({ task: v })} onSubmit={v => set({ task: v })} />
          ) : (
            <Text dimColor>Type the task on the desktop app or the terminal.</Text>
          )}
          {mode === 'pipeline' && (
            <Box flexDirection="column" gap={1}>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Text dimColor>Kind</Text>
                {chip('kind-auto', 'Auto', p.kind === null, () => update($, pipeline, now => ({ ...now, kind: null })))}
                {KINDS.map(k => chip(`kind-${k.id}`, k.label, p.kind === k.id, () => update($, pipeline, now => ({ ...now, kind: k.id }))))}
              </Box>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Text dimColor>Size</Text>
                {chip('size-auto', 'Auto', p.size === null, () => update($, pipeline, now => ({ ...now, size: null })))}
                {SIZES.map(z => chip(`size-${z.id}`, z.label, p.size === z.id, () => update($, pipeline, now => ({ ...now, size: z.id }))))}
              </Box>
              {auto && <Text key="pipeline-auto" color="success">{auto}</Text>}
              <Text dimColor>{gatesText(size)}</Text>
              {preview.steps.map(step => (
                <Box key={`plan-step-${step.id}`} flexDirection="column">
                  {stepAgentRow($, e, step)}
                  {step.note && <Text dimColor>{step.note}</Text>}
                  {p.picking === step.id && renderPicker($, e, step.id, cards)}
                </Box>
              ))}
              {(p.preflight ?? []).map(short => (
                <Box key={`preflight-${short.step}`} flexDirection="row" gap={1} flexWrap="wrap">
                  <Text color="error">{shortfallText(short)}</Text>
                  <Button key={`preflight-plain-${short.step}`} label="Use plain Claude Code for this step" onPress={() => pickAgent($, short.step, null)} />
                </Box>
              ))}
            </Box>
          )}
          {mode === 'parallel' && (
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
            <Button key="swarm-start" label={mode === 'pipeline' ? 'Start' : `Start ${s.picked.length} agents`} variant="primary" onPress={() => start($)} />
          </Box>
        </Box>
      )}
    </Box>
  )
}

// A step's agent, with the small chip that opens its picker.
function stepAgentRow($: EngineInterface, e: RenderInput, step: PipeStep) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box flexDirection="row" gap={1}>
      <Text>{STEP_ICON[step.id]} {STEP_LABEL[step.id]}</Text>
      <Text dimColor>{step.agent ?? 'plain Claude Code'}</Text>
      <Button key={`agent-${step.id}`} label="agent" variant="secondary" dimColor onPress={() => pickStep($, step.id)} />
    </Box>
  )
}

// The deck's agents for one step, plus plain Claude Code.
function renderPicker($: EngineInterface, e: RenderInput, step: PipeStepId, cards: DeckAgent[]) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      <Text dimColor>{STEP_LABEL[step]} with</Text>
      <Button key="step-agent-none" label="Plain Claude Code" onPress={() => pickAgent($, step, null)} />
      {cards.map(c => <Button key={`step-agent-${c.agent.name}`} label={c.agent.name} onPress={() => pickAgent($, step, c.agent.name)} />)}
      <Button key="step-agent-cancel" label="Cancel" variant="secondary" dimColor onPress={() => pickStep($, undefined)} />
    </Box>
  )
}

function renderRun($: EngineInterface, e: RenderInput, run: PipeRun, note: string, cards: DeckAgent[], picking: PipeStepId | null) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const gate = run.steps.findIndex(s => s.status === 'gate')
  const kind = KINDS.find(k => k.id === run.kind)?.label
  const size = SIZES.find(z => z.id === run.size)?.label
  const hasConfirmed = run.steps[gate]?.id === 'review' && (run.findings ?? []).some(f => f.verdict === 'confirmed')
  const blocked = run.steps.find(s => s.status === 'blocked')

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold wrap="truncate-end">{kind} · {size} · {run.task}</Text>
      {run.steps.map((step, i) => (
        <Box key={`step-${i}`} flexDirection="column" borderStyle="round" borderColor={step.status === 'gate' ? 'warning' : undefined} paddingX={1}>
          <Box flexDirection="row" gap={1}>
            <Text>{STEP_ICON[step.id]} {i + 1}. {STEP_LABEL[step.id]}</Text>
            <Text dimColor>{step.agent ?? 'plain Claude Code'}</Text>
            <Text color={STATUS_COLOR[step.status]}>{STATUS[step.status]}</Text>
            {!run.ended && (step.status === 'waiting' || step.status === 'blocked') && <Button key={`agent-${step.id}`} label="agent" variant="secondary" dimColor onPress={() => pickStep($, step.id)} />}
          </Box>
          {step.note && <Text dimColor>{step.note}</Text>}
          {!run.ended && picking === step.id && renderPicker($, e, step.id, cards)}
          {(step.status === 'done' || step.status === 'gate') && <Text dimColor>{fileOf(run, i)}</Text>}
          {step.status === 'gate' && step.id === 'plan' && run.sizeNote && <Text color="warning">{run.sizeNote}</Text>}
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
      {blocked && !run.ended && (
        <Box flexDirection="row" gap={1}>
          <Button key="pipeline-retry" label="Retry" variant="primary" onPress={() => retryPipeline($)} />
          <Button key="pipeline-change-agent" label="Change agent" onPress={() => pickStep($, blocked.id)} />
          <Button key="pipeline-stop" label="Stop" onPress={() => stopPipeline($)} />
        </Box>
      )}
      {gate < 0 && !blocked && !run.ended && <Button key="pipeline-stop" label="Stop" onPress={() => stopPipeline($)} />}
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
  const notes = s.mode === 'parallel'
    ? await startSwarm($, s.preset, s.picked, s.task)
    : await startPipeline($, s.task, p.kind ?? guessKind(s.task).value, p.size ?? guessSize(s.task).value)
  await update($, swarm, d => ({ ...d, note: notes.length ? notes.join(' ') : null }))
  if (notes.length) $.ui.toast(notes.join(' '))
}
