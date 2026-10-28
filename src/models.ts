// What a model chip or an agent's `model` means for a turn. Pure: no `$`.

// Full ids for the chips: turn.step takes the id the request names.
export const CLAUDE_IDS: Record<string, string> = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}

// Dollars per million tokens, for the Runs view's estimate (cached 2026-10).
// Cache writes cost 1.25x input. Update with CLAUDE_IDS when models change.
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}

// Every current model has a 1M-token window.
export const CONTEXT_TOKENS = 1_000_000

// Which price row a model id or alias falls under: the newest of its family.
export function priceOf(model: string): { input: number; output: number; cacheRead: number } | undefined {
  const id = CLAUDE_IDS[model] ?? model
  const family = ['fable', 'opus', 'sonnet', 'haiku'].find(f => id.includes(f))
  return PRICES[id] ?? Object.entries(PRICES).find(([k]) => family !== undefined && k.includes(family))?.[1]
}

// "Opus 5.5" from `claude-opus-5-5`, an alias, or a dated id.
export function modelName(model: string): string {
  const id = CLAUDE_IDS[model] ?? model
  const m = /claude-(\w+)-(\d+)(?:-(\d))?(?:\b|$)/.exec(id)
  if (!m?.[1]) return model
  const family = m[1][0]!.toUpperCase() + m[1].slice(1)
  return m[3] ? `${family} ${m[2]}.${m[3]}` : `${family} ${m[2]}`
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
