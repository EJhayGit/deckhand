// The Runs tab: every agent this session started, with cost, tokens, time,
// steps and a progress bar per agent.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { Run } from '../../types'
import { modelName } from '../models'
import { clockText, costText, ctxPercent, elapsed, progressOf, tokensText, totals } from '../runs'
import { clearFinished } from '../tracker'
import { renderIcon } from './deck'
import { COLORS, weightOf } from './status'

const runs = atom({ plugin: 'deckhand', key: 'runs' } as const, [] as Run[])
const collapsed = atom({ plugin: 'deckhand', key: 'collapsed' } as const, [] as string[])

export async function renderRuns($: EngineInterface, e: RenderInput) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const all = await read($, runs)
  const shut = await read($, collapsed)
  const now = await $.clock.now()
  const sum = totals(all, now)
  const sections = [
    { key: 'Running', rows: all.filter(r => r.status === 'running') },
    { key: 'Finished', rows: all.filter(r => r.status !== 'running') },
  ].filter(s => s.rows.length > 0)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1}>
        {[['Cost', costText(sum.cost)], ['Tokens', tokensText(sum.tokens)], ['Time', clockText(sum.ms)]].map(([label, value]) => (
          <Box key={`tile-${label}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} flexGrow={1}>
            <Text dimColor>{label}</Text>
            <Text bold size="heading" tabular>{value}</Text>
          </Box>
        ))}
      </Box>
      {all.length === 0 && <Text dimColor>No runs yet. Start a swarm, or let Claude hand work to an agent.</Text>}
      {sections.map(s => {
        const isShut = shut.includes(`runs-${s.key}`)
        return (
          <Box key={`runs-${s.key}`} flexDirection="column" gap={1}>
            <Button key={`runs-group-${s.key}`} plain label={`${isShut ? '▸' : '▾'} ${s.key} · ${s.rows.length}`} onPress={() => update($, collapsed, c => (isShut ? c.filter(n => n !== `runs-${s.key}`) : [...c, `runs-${s.key}`]))} />
            {!isShut && s.rows.map(r => renderRow($, e, r, now))}
          </Box>
        )
      })}
      {all.some(r => r.status !== 'running') && <Button key="clear-runs" label="Clear finished" onPress={() => clearFinished($)} />}
    </Box>
  )
}

function renderRow($: EngineInterface, e: RenderInput, run: Run, now: number) {
  const { Box, Text } = $.ui.resolve(e)
  const weight = weightOf(run.effort)
  const color = run.status === 'failed' ? COLORS.red! : (weight?.color ?? COLORS[run.color ?? ''] ?? COLORS.gray!)
  const mark = run.status === 'done' ? '✓' : run.status === 'failed' ? '✕' : '…'
  const stats = `ctx ${ctxPercent(run)}% · ${tokensText(run.tokens)} ${costText(run.cost)} ${clockText(elapsed(run, now))}`
  const card = { agent: { name: run.name, icon: undefined, color: run.color, limits: { edit: false, run: false, internet: false }, gateway: null, description: '', body: '' }, hat: run.hat }

  return (
    <Box key={`run-${run.agentId}`} flexDirection="row" gap={1}>
      {renderIcon($, e, card)}
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate-end">{run.title}</Text>
          <Text color={run.status === 'failed' ? 'error' : run.status === 'done' ? 'success' : undefined}>{mark}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          {weight && <Text color={weight.color}>{weight.word}</Text>}
          <Text dimColor>{[modelName(run.model), run.effort].filter(Boolean).join(' · ')}</Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between">
          <Text tabular>{run.steps ? `${run.steps.done}/${run.steps.total}` : run.name}</Text>
          <Text dimColor tabular>{stats}</Text>
        </Box>
        {renderBar($, e, run, color)}
      </Box>
    </Box>
  )
}

function renderBar($: EngineInterface, e: RenderInput, run: Run, color: string) {
  const { Box, Text } = $.ui.resolve(e)
  const part = progressOf(run)
  if (e.surface === 'terminal') {
    const width = 30
    const full = Math.round(part * width)
    return <Text color={color}>{'█'.repeat(full)}<Text dimColor>{'░'.repeat(width - full)}</Text></Text>
  }

  return (
    <Box width="100%" height={1} backgroundColor="#2a2a2e">
      <Box width={`${Math.round(part * 100)}%`} height={1} backgroundColor={color} />
    </Box>
  )
}
