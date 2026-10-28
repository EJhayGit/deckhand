// The Deck panel: one card per agent, and the form when one is open.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { DeckAgent, View } from '../../types'
import { refreshDeck, removeAgent, saveToLibrary, writeAgent } from '../agents/library'
import { STARTERS } from '../agents/starters'
import { LOCAL_HINT } from '../gateway'
import { badges } from '../limits'
import { routeOf } from '../models'
import { useAgent, useNone } from '../session'
import { renderForm } from './form'
import { COLORS, iconText, modelLabel } from './status'

export const DECK = { id: 'deck', title: 'Deck' }

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)
const view = atom({ plugin: 'deckhand', key: 'view' } as const, { kind: 'deck' } as View)
const menu = atom({ plugin: 'deckhand', key: 'menu' } as const, null as string | null)
const confirm = atom({ plugin: 'deckhand', key: 'confirm' } as const, null as string | null)

// A function declaration: validate only follows `$` past an import into one.
export async function renderDeck($: EngineInterface, e: RenderInput) {
  const shown = await read($, view)
  if (shown.kind === 'form') return renderForm($, e, shown.draft)

  const { Box, Text, Button } = $.ui.resolve(e)
  const cards = await read($, deck)
  const inUse = await read($, active)
  const open = await read($, menu)
  const asked = await read($, confirm)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Deck</Text>
        <Button key="new" label="+ New" onPress={() => openNew($)} />
      </Box>
      {cards.length === 0 && <Text dimColor>Deck is empty</Text>}
      {cards.map(card => renderCard($, e, card, card.agent.name === inUse, open === card.agent.name, asked === card.agent.name))}
      <Box key="new-card" borderStyle="round" borderDimColor flexDirection="row">
        <Button key="new-card" plain label="+ New agent" onPress={() => openNew($)} />
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key="none" label={inUse === null ? '● None' : 'None'} dimColor={inUse === null} onPress={() => useNone($)} />
        <Text dimColor>{inUse === null ? 'No agent: Claude Code as usual' : `In use: ${inUse}`}</Text>
      </Box>
    </Box>
  )
}

function renderCard($: EngineInterface, e: RenderInput, card: DeckAgent, isActive: boolean, isMenuOpen: boolean, isAsked: boolean) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { agent } = card
  const name = agent.name
  const summary = [modelLabel(agent.model), agent.description].filter(s => s !== '').join(' · ')
  const tags = [...badges(agent.limits), ...(card.source === 'library' ? ['library'] : [])]

  return (
    <Box key={`card-${name}`} flexDirection="column" borderStyle="round" borderColor={isActive ? 'success' : undefined} paddingX={1}>
      <Box flexDirection="row" gap={1}>
        {renderIcon($, e, card)}
        <Box flexDirection="column" flexShrink={1}>
          <Text bold>{name}</Text>
          <Text dimColor wrap="truncate-end">{summary}</Text>
          <Text dimColor>{tags.map(t => `[${t}]`).join(' ')}</Text>
          {routeOf(agent.model).kind === 'local' && <Text dimColor>{LOCAL_HINT}</Text>}
        </Box>
      </Box>
      <Box flexDirection="row" gap={1}>
        <Button key={`use-${name}`} label={isActive ? 'In use' : 'Use'} variant={isActive ? 'primary' : 'secondary'} onPress={() => useAgent($, name)} />
        <Button key={`edit-${name}`} label="Edit" onPress={() => openEdit($, name)} />
        <Button key={`more-${name}`} label="…" onPress={() => update($, menu, now => (now === name ? null : name))} />
      </Box>
      {isMenuOpen && (
        <Box flexDirection="row" gap={1}>
          <Button key={`dup-${name}`} label="Duplicate" onPress={() => duplicate($, name)} />
          <Button key={`lib-${name}`} label={card.isInLibrary ? 'Update my library' : 'Save to my library'} onPress={() => toLibrary($, name)} />
          {card.source === 'library' && <Button key={`add-${name}`} label="Add to this project" onPress={() => toProject($, name)} />}
          <Button key={`del-${name}`} label="Delete" onPress={() => update($, confirm, () => name)} />
        </Box>
      )}
      {isAsked && (
        <Box flexDirection="row" gap={1}>
          <Text color="error">Delete {name}{card.source === 'library' ? ' from your library' : ''}?</Text>
          <Button key={`confirm-del-${name}`} label="Delete" onPress={() => remove($, name)} />
          <Button key={`cancel-del-${name}`} label="Cancel" onPress={() => update($, confirm, () => null)} />
        </Box>
      )}
    </Box>
  )
}

function renderIcon($: EngineInterface, e: RenderInput, card: DeckAgent) {
  const color = COLORS[card.agent.color ?? ''] ?? COLORS.gray
  const elements = $.ui.resolve(e)
  // The terminal has no Svg: uploaded icons fall back to the emoji or letter there.
  if (e.surface !== 'terminal' && 'Svg' in elements && card.iconSvg) {
    const { Svg } = elements
    return <Svg source={card.iconSvg} alt={card.agent.name} width={32} height={32} />
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
