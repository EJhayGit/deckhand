// What a model chip or an agent's `model` means for a turn. Pure: no `$`.

// Full ids for the chips: turn.step takes the id the request names.
export const CLAUDE_IDS: Record<string, string> = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}

export type Route =
  | { kind: 'claude'; id: string }
  | { kind: 'local'; model: string }
  | { kind: 'codex' }
  | { kind: 'default' }

// `local` alone uses the gateway's default model; `local:<name>` picks one.
export function routeOf(model: string | undefined): Route {
  if (model === undefined || model === 'default' || model === '') return { kind: 'default' }
  if (model === 'codex') return { kind: 'codex' }
  if (model === 'local') return { kind: 'local', model: '' }
  if (model.startsWith('local:')) return { kind: 'local', model: model.slice(6) }

  return { kind: 'claude', id: CLAUDE_IDS[model] ?? model }
}
