// The Deck panel: tabs, one card per agent in collapsible groups, and the
// form when one is open.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { DeckAgent, DeckTab, PipeStepId, Pipeline, Run, SkillsView, SwarmDraft, View } from '../../types'
import { refreshDeck, removeAgent, saveToLibrary, writeAgent } from '../agents/library'
import { GROUPS, STARTERS } from '../agents/starters'
import { LOCAL_HINT } from '../gateway'
import { badges } from '../limits'
import { routeOf } from '../models'
import { STEP_LABEL, guessSize, stepsFor } from '../pipeline'
import { pickAgent } from '../pipelineRun'
import { SETTINGS_PATH, missingPlugins, pluginName, withPlugins } from '../plugins'
import { useAgent, useNone } from '../session'
import { PRESETS } from '../swarm'
import { renderChips } from './chips'
import { renderForm } from './form'
import { mascotSvg } from './mascot'
import { renderRuns } from './runs'
import { renderSkills } from './skills'
import { COLORS, cardStatus, iconText, modelText, weightOf } from './status'
import { renderSwarm } from './swarm'

export const DECK = { id: 'deck', title: 'Deck' }

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)
const view = atom({ plugin: 'deckhand', key: 'view' } as const, { kind: 'deck' } as View)
const menu = atom({ plugin: 'deckhand', key: 'menu' } as const, null as string | null)
const confirm = atom({ plugin: 'deckhand', key: 'confirm' } as const, null as string | null)
const tab = atom({ plugin: 'deckhand', key: 'tab' } as const, 'deck' as DeckTab)
const collapsed = atom({ plugin: 'deckhand', key: 'collapsed' } as const, [] as string[])
const setup = atom({ plugin: 'deckhand', key: 'setup' } as const, null as string | null)
const enabledPlugins = atom({ plugin: 'deckhand', key: 'enabledPlugins' } as const, [] as string[])
const runs = atom({ plugin: 'deckhand', key: 'runs' } as const, [] as Run[])
const pipeline = atom({ plugin: 'deckhand', key: 'pipeline' } as const, { kind: null, size: null, note: '', run: null, history: [] } as Pipeline)
const swarm = atom({ plugin: 'deckhand', key: 'swarm' } as const, { preset: 'launch-kit', picked: Object.keys(PRESETS[0]!.parts), mode: 'pipeline', task: '', note: null } as SwarmDraft)
const pinned = atom({ plugin: 'deckhand', key: 'skillsPinned' } as const, [] as string[])
const skillsView = atom({ plugin: 'deckhand', key: 'skillsView' } as const, { query: '', open: null, note: '' } as SkillsView)

// Cards are this wide so a group wraps into a grid at any pane width.
const CARD_WIDTH = 24

const TABS: readonly { id: DeckTab; label: string }[] = [
  { id: 'deck', label: 'Deck' },
  { id: 'runs', label: 'Runs' },
  { id: 'swarm', label: 'Swarm' },
  { id: 'skills', label: 'Skills' },
]

// A function declaration: validate only follows `$` past an import into one.
export async function renderDeck($: EngineInterface, e: RenderInput) {
  const shown = await read($, view)
  if (shown.kind === 'form') return renderForm($, e, shown.draft)

  const { Box, Text, Button } = $.ui.resolve(e)
  const version = await versionOf($)
  const now = await read($, tab)
  const body = now === 'runs' ? await renderRuns($, e)
    : now === 'swarm' ? await renderSwarm($, e)
      : now === 'skills' ? await renderSkills($, e)
        : await renderCards($, e)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Deck{version ? ` v${version}` : ''}</Text>
        <Button key="new" label="+ New" onPress={() => openNew($)} />
      </Box>
      <Box flexDirection="row" gap={1}>
        {TABS.map(t => (
          <Button key={`tab-${t.id}`} label={t.label} variant={t.id === now ? 'primary' : 'secondary'} onPress={() => update($, tab, () => t.id)} />
        ))}
      </Box>
      {body}
    </Box>
  )
}

// The running build's version, from the plugin's own manifest; kept once found.
let version: string | undefined

async function versionOf($: EngineInterface): Promise<string | undefined> {
  if (version !== undefined) return version
  const text = await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`).catch(() => undefined)
  try {
    const found = typeof text === 'string' ? (JSON.parse(text) as { version?: unknown }).version : undefined
    if (typeof found === 'string') version = found
  } catch {
    // A broken manifest: the header shows plain Deck.
  }

  return version
}

async function renderCards($: EngineInterface, e: RenderInput) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const cards = await read($, deck)
  const inUse = await read($, active)
  const open = await read($, menu)
  const asked = await read($, confirm)
  const shut = await read($, collapsed)
  const settingUp = await read($, setup)
  const enabled = await read($, enabledPlugins)
  const running = (await read($, runs)).filter(r => r.status === 'running')
  const p = await read($, pipeline)
  const task = (await read($, swarm)).task
  const steps = p.run && !p.run.ended ? undefined : stepsFor(p.size ?? guessSize(task).value)
  const carried = cards.find(c => c.agent.name === inUse)?.agent.skills ?? []
  const skillIds = [...new Set([...(await read($, pinned)), ...carried])]
  const chips = await renderChips($, e)
  const groups = ['Mine', ...GROUPS].map(g => ({ name: g, cards: cards.filter(c => (c.group ?? 'Mine') === g) })).filter(g => g.cards.length > 0)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1}>
        <Button key="none" label={inUse === null ? '● None' : 'None'} dimColor={inUse === null} onPress={() => useNone($)} />
        <Text dimColor>{inUse === null ? 'No agent: Claude Code as usual' : `In use: ${inUse}`}</Text>
      </Box>
      {chips}
      {groups.map(g => {
        const isShut = shut.includes(g.name)
        return (
          <Box key={`group-box-${g.name}`} flexDirection="column" gap={1}>
            <Button key={`group-${g.name}`} plain label={`${isShut ? '▸' : '▾'} ${g.name} · ${g.cards.length}`} onPress={() => update($, collapsed, now => (isShut ? now.filter(n => n !== g.name) : [...now, g.name]))} />
            {!isShut && (
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {g.cards.map(card => renderCard($, e, card, {
                  isActive: card.agent.name === inUse,
                  running: running.filter(r => r.name === card.agent.name).length,
                  isSettingUp: settingUp === card.agent.name,
                  missing: missingPlugins(card.agent, enabled),
                }))}
              </Box>
            )}
            {!isShut && g.cards.filter(c => c.agent.name === open).map(card => renderDetail($, e, card, steps))}
            {g.cards.filter(c => c.agent.name === asked).map(card => renderConfirm($, e, card))}
          </Box>
        )
      })}
      <Box key="new-card" borderStyle="round" borderDimColor flexDirection="row">
        <Button key="new-card" plain label="+ New agent" onPress={() => openNew($)} />
      </Box>
      <Text bold>Skills</Text>
      {skillIds.length === 0 && <Text dimColor>Pin skills in the Skills tab to see them here.</Text>}
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {skillIds.map(id => (
          <Box key={`skill-card-${id}`} borderStyle="single" borderDimColor hover={{ borderColor: 'primary' }} paddingX={1}>
            <Button key={`deck-skill-${id}`} plain label={`/${id}${carried.includes(id) ? ' ●' : ''}`} onPress={() => openSkill($, id)} />
          </Box>
        ))}
      </Box>
    </Box>
  )
}

type CardState = { isActive: boolean; running: number; isSettingUp: boolean; missing: string[] }

// The card face: fixed width so a group wraps into a grid. Name and status are
// their own Texts; a Button can't hold a Box, so only the buttons press.
function renderCard($: EngineInterface, e: RenderInput, card: DeckAgent, s: CardState) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { agent } = card
  const name = agent.name
  const weight = weightOf(agent.effort)
  const status = cardStatus(s.isActive, s.running)
  const tags = [...badges(agent.limits), ...(card.source === 'library' ? ['library'] : [])]

  return (
    <Box key={`card-${name}`} flexDirection="column" width={CARD_WIDTH} borderStyle="round" borderColor={s.running > 0 ? 'warning' : s.isActive ? 'success' : undefined} hover={{ borderColor: 'primary' }} paddingX={1}>
      <Box flexDirection="row" gap={1}>
        {renderIcon($, e, card)}
        <Text bold wrap="truncate-end">{name}</Text>
      </Box>
      <Text color={status.color}>{status.glyph} {status.word}</Text>
      {agent.description !== '' && <Text dimColor wrap="truncate-end">{agent.description}</Text>}
      <Box flexDirection="row" gap={1}>
        {weight && <Text color={weight.color}>{weight.word}</Text>}
        <Text dimColor wrap="truncate-end">{[modelText(agent.model), agent.effort].filter(Boolean).join(' · ')}</Text>
      </Box>
      <Text dimColor wrap="truncate-end">{tags.join(' · ')}</Text>
      {s.missing.length > 0 && (
        <Box flexDirection="row" gap={1}>
          <Text color="warning">needs {s.missing.map(pluginName).join(', ')}</Text>
          <Button key={`setup-${name}`} label="Set up" onPress={() => update($, setup, () => name)} />
        </Box>
      )}
      {s.isSettingUp && (
        <Box flexDirection="column">
          <Text>Add {s.missing.join(', ')} to this project's {SETTINGS_PATH}? Claude Code offers to install them on restart.</Text>
          <Box flexDirection="row" gap={1}>
            <Button key={`confirm-setup-${name}`} label="Add" variant="primary" onPress={() => setUp($, s.missing)} />
            <Button key={`cancel-setup-${name}`} label="Cancel" onPress={() => update($, setup, () => null)} />
          </Box>
        </Box>
      )}
      <Box flexDirection="row" gap={1}>
        <Button key={`use-${name}`} label={s.isActive ? 'In use' : 'Use'} variant={s.isActive ? 'primary' : 'secondary'} onPress={() => useAgent($, name)} />
        <Button key={`edit-${name}`} label="Edit" onPress={() => openEdit($, name)} />
        <Button key={`more-${name}`} label="⋯" onPress={() => update($, menu, now => (now === name ? null : name))} />
      </Box>
    </Box>
  )
}

// The selected card's description and actions, under its group's grid.
function renderDetail($: EngineInterface, e: RenderInput, card: DeckAgent, steps: readonly PipeStepId[] | undefined) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { agent } = card
  const name = agent.name

  return (
    <Box key={`detail-${name}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Text bold>{name}</Text>
      {agent.description !== '' && <Text dimColor>{agent.description}</Text>}
      {routeOf(agent.model).kind === 'local' && <Text dimColor>{LOCAL_HINT}</Text>}
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        <Button key={`dup-${name}`} label="Duplicate" onPress={() => duplicate($, name)} />
        <Button key={`lib-${name}`} label={card.isInLibrary ? 'Update my library' : 'Save to my library'} onPress={() => toLibrary($, name)} />
        {card.source !== 'project' && <Button key={`add-${name}`} label="Add to this project" onPress={() => toProject($, name)} />}
        {card.source !== 'builtin' && <Button key={`del-${name}`} label="Delete" onPress={() => update($, confirm, () => name)} />}
      </Box>
      {steps && (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Text dimColor>Put on step</Text>
          {steps.map(step => <Button key={`place-${name}-${step}`} label={STEP_LABEL[step]} onPress={() => place($, name, step)} />)}
        </Box>
      )}
    </Box>
  )
}

// Shown wherever the card is, so a pending delete never hides with its menu.
function renderConfirm($: EngineInterface, e: RenderInput, card: DeckAgent) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const name = card.agent.name

  return (
    <Box key={`confirm-${name}`} flexDirection="row" gap={1}>
      <Text color="error">Delete {name}{card.source === 'library' ? ' from your library' : ''}?</Text>
      <Button key={`confirm-del-${name}`} label="Delete" onPress={() => remove($, name)} />
      <Button key={`cancel-del-${name}`} label="Cancel" onPress={() => update($, confirm, () => null)} />
    </Box>
  )
}

async function place($: EngineInterface, name: string, step: PipeStepId) {
  await pickAgent($, step, name)
  await update($, tab, () => 'swarm')
}

export function renderIcon($: EngineInterface, e: RenderInput, card: Pick<DeckAgent, 'agent' | 'iconSvg' | 'hat'>) {
  const color = COLORS[card.agent.color ?? ''] ?? COLORS.gray!
  const elements = $.ui.resolve(e)
  // The terminal has no Svg: icons fall back to the emoji or letter there.
  if (e.surface !== 'terminal' && 'Svg' in elements) {
    const { Svg } = elements
    if (card.iconSvg) return <Svg source={card.iconSvg} alt={card.agent.name} width={32} height={32} />
    if (card.hat) return <Svg source={mascotSvg(color, card.hat)} alt={card.agent.name} width={35} height={30} />
  }
  const { Box, Text } = elements

  return (
    <Box backgroundColor={color} paddingX={1}>
      <Text>{iconText(card.agent)}</Text>
    </Box>
  )
}

async function openSkill($: EngineInterface, id: string) {
  await update($, skillsView, () => ({ query: '', open: id, note: '' }))
  await update($, tab, () => 'skills')
}

async function cardOf($: EngineInterface, name: string): Promise<DeckAgent | undefined> {
  return (await read($, deck)).find(c => c.agent.name === name)
}

async function openNew($: EngineInterface) {
  const blank = STARTERS.find(s => s.id === 'blank')!
  await update($, view, (): View => ({ kind: 'form', draft: { agent: { ...blank.agent, name: '' }, editing: null, starter: 'blank', note: null } }))
}

async function openEdit($: EngineInterface, name: string) {
  const card = await cardOf($, name)
  if (!card) return
  await update($, view, (): View => ({ kind: 'form', draft: { agent: card.agent, editing: name, starter: '', note: null } }))
}

async function duplicate($: EngineInterface, name: string) {
  const card = await cardOf($, name)
  if (!card) return
  const names = (await read($, deck)).map(c => c.agent.name)
  let copy = `${name}-copy`
  for (let n = 2; names.includes(copy); n++) copy = `${name}-copy-${n}`
  await writeAgent($, { ...card.agent, name: copy }, card.text)
  await update($, menu, () => null)
  await refreshDeck($)
}

async function toLibrary($: EngineInterface, name: string) {
  const card = await cardOf($, name)
  if (!card) return
  await saveToLibrary($, name, card.text)
  await update($, menu, () => null)
  await refreshDeck($)
  $.ui.toast(`${name} is in your library and shows in every project.`)
}

async function toProject($: EngineInterface, name: string) {
  const card = await cardOf($, name)
  if (!card) return
  await $.fs.write(`.claude/agents/${name}.md`, card.text)
  await update($, menu, () => null)
  await refreshDeck($)
}

// Project settings only; never ~/.claude. Runs after the person pressed Add.
async function setUp($: EngineInterface, specs: string[]) {
  await update($, setup, () => null)
  const old = await $.fs.read(SETTINGS_PATH).catch(() => undefined)
  const text = withPlugins(typeof old === 'string' ? old : undefined, specs)
  if (text === undefined) {
    $.ui.toast(`${SETTINGS_PATH} isn't valid JSON, so Deckhand left it alone. Fix it and try again.`)
    return
  }
  await $.fs.write(SETTINGS_PATH, text)
  await update($, enabledPlugins, now => [...new Set([...now, ...specs])])
  $.ui.toast(`Added ${specs.map(pluginName).join(', ')}. Restart Claude Code and accept the install prompt, or run /plugin.`)
}

async function remove($: EngineInterface, name: string) {
  const card = await cardOf($, name)
  await update($, confirm, () => null)
  await update($, menu, () => null)
  if (!card) return
  if (!(await removeAgent($, card))) {
    $.ui.toast(`Couldn't delete .claude/agents/${name}.md. Delete it by hand.`)
    return
  }
  if ((await read($, active)) === name) await useNone($)
  await refreshDeck($)
}
