// The Deck panel: tabs, one card per agent in collapsible groups, and the
// form when one is open.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { DeckAgent, DeckTab, View } from '../../types'
import { refreshDeck, removeAgent, saveToLibrary, writeAgent } from '../agents/library'
import { GROUPS, STARTERS } from '../agents/starters'
import { LOCAL_HINT } from '../gateway'
import { badges } from '../limits'
import { routeOf } from '../models'
import { SETTINGS_PATH, missingPlugins, pluginName, withPlugins } from '../plugins'
import { useAgent, useNone } from '../session'
import { renderForm } from './form'
import { mascotSvg } from './mascot'
import { renderRuns } from './runs'
import { COLORS, iconText, modelText, weightOf } from './status'
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

const TABS: readonly { id: DeckTab; label: string }[] = [
  { id: 'deck', label: 'Deck' },
  { id: 'runs', label: 'Runs' },
  { id: 'swarm', label: 'Swarm' },
]

// A function declaration: validate only follows `$` past an import into one.
export async function renderDeck($: EngineInterface, e: RenderInput) {
  const shown = await read($, view)
  if (shown.kind === 'form') return renderForm($, e, shown.draft)

  const { Box, Text, Button } = $.ui.resolve(e)
  const now = await read($, tab)
  const body = now === 'runs' ? await renderRuns($, e) : now === 'swarm' ? await renderSwarm($, e) : await renderCards($, e)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Deck</Text>
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

async function renderCards($: EngineInterface, e: RenderInput) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const cards = await read($, deck)
  const inUse = await read($, active)
  const open = await read($, menu)
  const asked = await read($, confirm)
  const shut = await read($, collapsed)
  const settingUp = await read($, setup)
  const enabled = await read($, enabledPlugins)
  const groups = ['Mine', ...GROUPS].map(g => ({ name: g, cards: cards.filter(c => (c.group ?? 'Mine') === g) })).filter(g => g.cards.length > 0)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1}>
        <Button key="none" label={inUse === null ? '● None' : 'None'} dimColor={inUse === null} onPress={() => useNone($)} />
        <Text dimColor>{inUse === null ? 'No agent: Claude Code as usual' : `In use: ${inUse}`}</Text>
      </Box>
      {groups.map(g => {
        const isShut = shut.includes(g.name)
        return (
          <Box key={`group-box-${g.name}`} flexDirection="column" gap={1}>
            <Button key={`group-${g.name}`} plain label={`${isShut ? '▸' : '▾'} ${g.name} · ${g.cards.length}`} onPress={() => update($, collapsed, now => (isShut ? now.filter(n => n !== g.name) : [...now, g.name]))} />
            {!isShut && g.cards.map(card => renderCard($, e, card, {
              isActive: card.agent.name === inUse,
              isMenuOpen: open === card.agent.name,
              isAsked: asked === card.agent.name,
              isSettingUp: settingUp === card.agent.name,
              missing: missingPlugins(card.agent, enabled),
            }))}
          </Box>
        )
      })}
      <Box key="new-card" borderStyle="round" borderDimColor flexDirection="row">
        <Button key="new-card" plain label="+ New agent" onPress={() => openNew($)} />
      </Box>
    </Box>
  )
}

type CardState = { isActive: boolean; isMenuOpen: boolean; isAsked: boolean; isSettingUp: boolean; missing: string[] }

function renderCard($: EngineInterface, e: RenderInput, card: DeckAgent, s: CardState) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { agent } = card
  const name = agent.name
  const weight = weightOf(agent.effort)
  const tags = [...badges(agent.limits), ...(card.source === 'library' ? ['library'] : [])]

  return (
    <Box key={`card-${name}`} flexDirection="column" borderStyle="round" borderColor={s.isActive ? 'success' : undefined} paddingX={1}>
      <Box flexDirection="row" gap={1}>
        {renderIcon($, e, card)}
        <Box flexDirection="column" flexShrink={1}>
          <Text bold>{name}</Text>
          <Box flexDirection="row" gap={1}>
            {weight && <Text color={weight.color}>{weight.word}</Text>}
            <Text dimColor>{[modelText(agent.model), agent.effort].filter(Boolean).join(' · ')}</Text>
          </Box>
          {agent.description !== '' && <Text dimColor wrap="truncate-end">{agent.description}</Text>}
          <Text dimColor>{tags.map(t => `[${t}]`).join(' ')}</Text>
          {routeOf(agent.model).kind === 'local' && <Text dimColor>{LOCAL_HINT}</Text>}
          {s.missing.length > 0 && (
            <Box flexDirection="row" gap={1}>
              <Text color="warning">needs {s.missing.map(pluginName).join(', ')}</Text>
              <Button key={`setup-${name}`} label="Set up" onPress={() => update($, setup, () => name)} />
            </Box>
          )}
        </Box>
      </Box>
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
        <Button key={`more-${name}`} label="…" onPress={() => update($, menu, now => (now === name ? null : name))} />
      </Box>
      {s.isMenuOpen && (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key={`dup-${name}`} label="Duplicate" onPress={() => duplicate($, name)} />
          <Button key={`lib-${name}`} label={card.isInLibrary ? 'Update my library' : 'Save to my library'} onPress={() => toLibrary($, name)} />
          {card.source !== 'project' && <Button key={`add-${name}`} label="Add to this project" onPress={() => toProject($, name)} />}
          {card.source !== 'builtin' && <Button key={`del-${name}`} label="Delete" onPress={() => update($, confirm, () => name)} />}
        </Box>
      )}
      {s.isAsked && (
        <Box flexDirection="row" gap={1}>
          <Text color="error">Delete {name}{card.source === 'library' ? ' from your library' : ''}?</Text>
          <Button key={`confirm-del-${name}`} label="Delete" onPress={() => remove($, name)} />
          <Button key={`cancel-del-${name}`} label="Cancel" onPress={() => update($, confirm, () => null)} />
        </Box>
      )}
    </Box>
  )
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
