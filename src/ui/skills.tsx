// The Skills tab: every installed skill, Pinned first, one press to run it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { SkillsView } from '../../types'
import { current } from '../session'
import { PINS_PATH, groupSkills, parsePins, searchSkills, skillsOf } from '../skills'
import type { Skill } from '../skills'
import { saveActive } from './chips'

const pinned = atom({ plugin: 'deckhand', key: 'skillsPinned' } as const, [] as string[])
const view = atom({ plugin: 'deckhand', key: 'skillsView' } as const, { query: '', open: null, note: '' } as SkillsView)

export async function renderSkills($: EngineInterface, e: RenderInput) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const v = await read($, view)
  const pins = await read($, pinned)
  const all = skillsOf(await $.command.list().catch(() => []))
  const groups = groupSkills(searchSkills(all, v.query), pins)
  const set = (change: Partial<SkillsView>) => update($, view, now => ({ ...now, ...change }))
  const hasInput = 'Input' in elements

  // Small cards in a wrapping row; the open skill's panel sits under its group.
  const card = (s: Skill, group: string) => (
    <Box key={`skill-${group}-${s.id}`} flexDirection="column" width={26} borderStyle="round" borderDimColor={v.open !== s.id} paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Button key={`open-${group}-${s.id}`} plain label={`/${s.id}`} onPress={() => set({ open: v.open === s.id ? null : s.id, note: '' })} />
        <Button key={`pin-${group}-${s.id}`} plain label={pins.includes(s.id) ? '★' : '☆'} onPress={() => togglePin($, s.id)} />
      </Box>
      {s.description !== '' && <Text dimColor wrap="truncate-end">{s.description}</Text>}
    </Box>
  )
  // A skill in Pinned and its own group opens once: an Input takes one key.
  let isShown = false
  const panel = (s: Skill) => {
    if (v.open !== s.id || isShown) return undefined
    isShown = true
    return (
      <Box key={`panel-${s.id}`} flexDirection="column" gap={1} paddingX={1}>
        {hasInput && <elements.Input key={`note-${s.id}`} label={`/${s.id} note (optional)`} placeholder="what to run it on" value={v.note} onInput={note => set({ note })} onSubmit={note => set({ note })} />}
        <Box flexDirection="row" gap={1}>
          <Button key={`run-${s.id}`} label="Run" variant="primary" onPress={() => run($, s.id, v.note)} />
          <Button key={`add-${s.id}`} label="Add to agent" onPress={() => addToAgent($, s.id)} />
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {hasInput && <elements.Input key="skills-search" label="Search" placeholder="name or description" value={v.query} onInput={query => set({ query })} onSubmit={query => set({ query })} />}
      {all.length === 0 && <Text dimColor>No skills are installed.</Text>}
      {all.length > 0 && groups.length === 0 && <Text dimColor>No skill matches.</Text>}
      {groups.map(g => (
        <Box key={`skills-${g.name}`} flexDirection="column" gap={1}>
          <Text bold>{g.name} · {g.skills.length}</Text>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {g.skills.map(s => card(s, g.name))}
          </Box>
          {g.skills.map(panel)}
        </Box>
      ))}
    </Box>
  )
}

export async function loadPins($: EngineInterface): Promise<void> {
  const text = await $.fs.read(PINS_PATH).catch(() => undefined)
  await update($, pinned, () => parsePins(typeof text === 'string' ? text : undefined))
}

// Pins live in the project, so each project keeps its own.
async function togglePin($: EngineInterface, id: string) {
  const now = await read($, pinned)
  const next = now.includes(id) ? now.filter(p => p !== id) : [...now, id]
  await update($, pinned, () => next)
  await $.fs.write(PINS_PATH, `${JSON.stringify(next, null, 2)}\n`)
}

// The host refuses a `/` prompt from a plugin, so the skill runs as a slash
// command the person typed, its lines in the transcript.
async function run($: EngineInterface, id: string, note: string) {
  await update($, view, now => ({ ...now, open: null, note: '' }))
  await $.command.run({ command: id, args: note.trim() }).catch((error: unknown) => $.ui.toast(`Couldn't run /${id}: ${String(error)}`))
}

async function addToAgent($: EngineInterface, id: string) {
  const now = await current($)
  if (!now) {
    $.ui.toast('Use an agent first, then add the skill to it.')
    return
  }
  const skills = now.card.agent.skills ?? []
  if (skills.includes(id)) {
    $.ui.toast(`${now.card.agent.name} already uses ${id}.`)
    return
  }
  await saveActive($, { skills: [...skills, id] })
}
