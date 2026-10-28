// The New and Edit agent form, drawn in the Deck panel.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import type { Agent, DeckAgent, Draft, View } from '../../types'
import { parseAgent } from '../agents/format'
import { ICONS_DIR, agentText, refreshDeck, registerAgent, removeAgent, saveToLibrary, writeAgent } from '../agents/library'
import { STARTERS } from '../agents/starters'
import { LIMIT_LABEL } from '../limits'
import type { Limit } from '../limits'
import { useAgent } from '../session'
import { COLORS, EFFORT_CHIPS, MODEL_CHIPS } from './status'

const deck = atom({ plugin: 'deckhand', key: 'deck' } as const, [] as DeckAgent[])
const active = atom({ plugin: 'deckhand', key: 'active' } as const, null as string | null)
const view = atom({ plugin: 'deckhand', key: 'view' } as const, { kind: 'deck' } as View)

export const EMOJI = ['🔍', '🛠️', '📝', '🧪', '🤖', '🚀', '🐛', '🧹', '📦', '🔒', '🎨', '📊', '🧠', '⚡', '🌐', '💬']
// Svg markup over this does not draw (the element's own limit).
const SVG_MAX = 131072
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export function renderForm($: EngineInterface, e: RenderInput, draft: Draft) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const back = <Button key="cancel" label="Cancel" onPress={() => update($, view, (): View => ({ kind: 'deck' }))} />
  if (!('Input' in elements)) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>Edit agents on the desktop app or the terminal.</Text>
        {back}
      </Box>
    )
  }
  const { Input } = elements
  const a = draft.agent
  const chip = (key: string, label: string, isOn: boolean, press: () => unknown) => (
    <Button key={key} label={label} variant={isOn ? 'primary' : 'secondary'} dimColor={!isOn} onPress={() => void press()} />
  )
  const set = (change: Partial<Agent>) => edit($, d => ({ ...d, agent: { ...d.agent, ...change }, note: null }))
  const row = (label: string, ...children: RenderChildren[]) => (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      <Text dimColor>{label}</Text>
      {children}
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{draft.editing ? `Edit ${draft.editing}` : 'New agent'}</Text>
      <Input key="name" label="Name" placeholder="reviewer" value={a.name} onInput={v => set({ name: v.trim() })} onSubmit={v => set({ name: v.trim() })} />
      {draft.editing === null &&
        row('Starts from', ...STARTERS.map(s => chip(`starter-${s.id}`, s.label, draft.starter === s.id, () => pickStarter($, s.id))))}
      {row('Icon', ...EMOJI.map((icon, i) => chip(`icon-${i}`, icon, a.icon === icon, () => set({ icon }))))}
      <Input key="emoji" label="Any emoji…" placeholder="🦊" onSubmit={v => set({ icon: v.trim() || undefined })} />
      <Input key="icon-path" label="Upload my own icon" placeholder="path to an .svg, .png or .jpg" onSubmit={v => uploadIcon($, v.trim())} />
      {a.icon?.endsWith('.svg') && <Text dimColor>Icon: {a.icon}</Text>}
      {row('Color', ...Object.keys(COLORS).map(c => chip(`color-${c}`, c, a.color === c, () => set({ color: c }))))}
      {row('Model', ...MODEL_CHIPS.map(m => chip(`fmodel-${m.id ?? 'default'}`, m.label, a.model === m.id, () => set({ model: m.id }))))}
      <Input key="custom-model" label="Custom…" placeholder="a model id, or local:<name> for a gateway model" onSubmit={v => set({ model: v.trim() || undefined })} />
      {row('Effort', ...EFFORT_CHIPS.map(f => chip(`feffort-${f.id}`, f.label, a.effort === f.id, () => set({ effort: a.effort === f.id ? undefined : f.id }))))}
      {row('Allowed to', ...(Object.keys(LIMIT_LABEL) as Limit[]).map(l => chip(`fcan-${l}`, LIMIT_LABEL[l], a.limits[l], () => set({ limits: { ...a.limits, [l]: !a.limits[l] } }))))}
      <Input key="description" label="When to use it (one line)" value={a.description} onInput={v => set({ description: v })} onSubmit={v => set({ description: v })} />
      {row(
        'Instructions',
        <Button key="import-agents" label="Import an AGENTS.md" onPress={() => importFile($, 'AGENTS.md')} />,
        <Button key="import-file" label="Import a CLAUDE.md or agent file" onPress={() => edit($, d => ({ ...d, note: 'Type the file path below and press Enter.' }))} />,
        <Button key="write-own" label="Write my own" onPress={() => set({ body: '' })} />,
      )}
      {draft.note === 'Type the file path below and press Enter.' && (
        <Input key="import-path" label="File to import" placeholder="CLAUDE.md" onSubmit={v => importFile($, v.trim())} />
      )}
      <Input key="body" label="Instructions" rows={8} value={a.body} onInput={v => set({ body: v })} onSubmit={v => set({ body: v })} />
      {draft.note && <Text color="warning">{draft.note}</Text>}
      <Box flexDirection="row" gap={1}>
        <Button key="save" label="Save" variant="primary" onPress={() => save($)} />
        {back}
      </Box>
    </Box>
  )
}

async function edit($: EngineInterface, change: (draft: Draft) => Draft) {
  await update($, view, (v): View => (v.kind === 'form' ? { kind: 'form', draft: change(v.draft) } : v))
}

async function note($: EngineInterface, text: string) {
  await edit($, d => ({ ...d, note: text }))
}

async function pickStarter($: EngineInterface, id: string) {
  const starter = STARTERS.find(s => s.id === id)
  if (!starter) return
  await edit($, d => ({ ...d, agent: { ...starter.agent, name: d.agent.name }, starter: id, note: null }))
}

async function importFile($: EngineInterface, path: string) {
  const text = await $.fs.read(path).catch(() => undefined)
  if (typeof text !== 'string') {
    await note($, `Couldn't read ${path}.`)
    return
  }
  // An agent file brings its instructions; any other file is the instructions.
  const body = text.startsWith('---') ? parseAgent(text).agent.body : text
  await edit($, d => ({ ...d, agent: { ...d.agent, body }, note: `Imported ${path}.` }))
}

async function uploadIcon($: EngineInterface, path: string) {
  const shown = await read($, view)
  if (shown.kind !== 'form') return
  const name = shown.draft.agent.name
  if (!NAME.test(name)) {
    await note($, 'Give the agent a name first, then upload its icon.')
    return
  }
  const ext = path.toLowerCase().split('.').pop() ?? ''
  let svg: string | undefined
  if (ext === 'svg') {
    const text = await $.fs.read(path).catch(() => undefined)
    svg = typeof text === 'string' && text.includes('<svg') ? text : undefined
  } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
    // The desktop draws Svg, not Image: a PNG or JPG rides inside an SVG image element.
    const bytes = await $.fs.read(path, { as: 'bytes' }).catch(() => undefined)
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
    svg = bytes && typeof bytes === 'object'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><image href="data:${mime};base64,${bytes.base64}" width="64" height="64"/></svg>`
      : undefined
  } else {
    await note($, 'Icons can be .svg, .png or .jpg files.')
    return
  }
  if (svg === undefined) {
    await note($, `Couldn't read an image from ${path}.`)
    return
  }
  if (svg.length > SVG_MAX) {
    await note($, 'That image is too big. Use an SVG, or a PNG or JPG under about 90 KB.')
    return
  }
  await $.fs.write(`${ICONS_DIR}/${name}.svg`, svg)
  await edit($, d => ({ ...d, agent: { ...d.agent, icon: `${name}.svg` }, note: 'Icon uploaded.' }))
}

async function save($: EngineInterface) {
  const shown = await read($, view)
  if (shown.kind !== 'form') return
  const { draft } = shown
  const cards = await read($, deck)
  const agent: Agent = {
    ...draft.agent,
    description: draft.agent.description.trim() || (draft.agent.body.split('\n')[0] ?? '').slice(0, 80),
  }
  if (!NAME.test(agent.name)) {
    await note($, 'Give the agent a name: letters, numbers, - or _, no spaces.')
    return
  }
  if (agent.name !== draft.editing && cards.some(c => c.agent.name === agent.name)) {
    await note($, `There is already an agent called ${agent.name}.`)
    return
  }
  const old = cards.find(c => c.agent.name === draft.editing)
  if (old?.source === 'library') {
    await saveToLibrary($, agent.name, agentText(agent, old.text))
    if (agent.name !== old.agent.name) {
      await removeAgent($, old)
    }
  } else {
    await writeAgent($, agent, old?.text)
    if (old && agent.name !== old.agent.name) await removeAgent($, old)
    if (old?.isInLibrary) await saveToLibrary($, agent.name, agentText(agent, old.text))
  }
  // A file written mid-session is not in Claude Code's agent list until restart.
  await registerAgent($, agent).catch(() => undefined)
  await refreshDeck($)
  await update($, view, (): View => ({ kind: 'deck' }))
  if ((await read($, active)) === draft.editing) await useAgent($, agent.name)

}
