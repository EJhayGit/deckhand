// A memory world beneath the plugin for tests: files, store, and what the mod
// showed (toasts, transcript lines, status, registered agents and commands).
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export type World = {
  files: Map<string, string>
  toasts: string[]
  logs: string[]
  status: (string | undefined)[]
  agents: { name: string; disallowedTools?: readonly string[]; model?: string }[]
  submitted: string[]
  aborted: string[]
  opened: string[]
}

export function world(on: On, files: Record<string, string> = {}, store: Record<string, unknown> = {}): World {
  const w: World = {
    files: new Map(Object.entries(files)),
    toasts: [],
    logs: [],
    status: [],
    agents: [],
    submitted: [],
    aborted: [],
    opened: [],
  }
  mock.store(on, store)

  on('fs.list', (_, e) => {
    const dir = `${e.path.replace(/\/$/, '')}/`
    const names = [...w.files.keys()].filter(p => p.startsWith(dir) && !p.slice(dir.length).includes('/'))
    if (names.length === 0) throw new Error(`ENOENT: ${e.path}`)
    return {
      value: names.map(p => ({ name: p.slice(dir.length), kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })),
    }
  })
  on('fs.read', (_, e) => {
    const text = w.files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('fs.write', (_, e) => {
    w.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', (_, e) => ({ value: w.files.has(e.path) }))
  on('process.run', (_, e) => {
    const path = e.argv[e.argv.length - 1] ?? ''
    w.files.delete(path)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_, e) => {
    w.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_, e) => {
    w.status.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    w.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('agent.register', (_, e) => {
    w.agents.push({ name: e.name, disallowedTools: e.disallowedTools, model: e.model })
    return { value: { agent: `deckhand:${e.name}` } }
  })
  on('prompt.submit', (_, e) => {
    w.submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.abort', (_, e) => {
    w.aborted.push(e.turnId)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return w
}

export const PANE = {
  plugin: 'deckhand',
  component: 'Pane',
  requestId: 'deck',
  props: {
    title: 'Deck',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

export const SURFACES = ['terminal', 'desktop'] as const
