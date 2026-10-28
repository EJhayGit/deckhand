// Plugins an agent needs, and adding them to a project's settings. Pure: no `$`.
import type { Agent } from '../types'

// The GitHub repo behind each marketplace a built-in agent names.
export const MARKETPLACES: Record<string, string> = {
  'taste-skill': 'Leonxlnx/taste-skill',
  trailofbits: 'trailofbits/skills',
  'claude-plugins-official': 'anthropics/claude-plugins-official',
  'anthropic-agent-skills': 'anthropics/skills',
}

export const SETTINGS_PATH = '.claude/settings.json'

export function missingPlugins(agent: Agent, enabled: readonly string[]): string[] {
  return (agent.plugins ?? []).filter(p => !enabled.includes(p))
}

// `taste-skill@taste-skill` -> `taste-skill`.
export function pluginName(spec: string): string {
  return spec.split('@')[0] ?? spec
}

// The settings file with each plugin turned on and its marketplace known,
// everything else kept. Undefined when the file is not a JSON object, so a
// hand-broken file is never overwritten.
export function withPlugins(text: string | undefined, specs: readonly string[]): string | undefined {
  let settings: Record<string, unknown>
  try {
    settings = text === undefined || text.trim() === '' ? {} : JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) return undefined
  const known = { ...(settings.extraKnownMarketplaces as Record<string, unknown> | undefined) }
  const enabled = { ...(settings.enabledPlugins as Record<string, unknown> | undefined) }
  for (const spec of specs) {
    const market = spec.split('@')[1] ?? ''
    const repo = MARKETPLACES[market]
    if (repo && known[market] === undefined) known[market] = { source: { source: 'github', repo } }
    enabled[spec] = true
  }

  return `${JSON.stringify({ ...settings, extraKnownMarketplaces: known, enabledPlugins: enabled }, null, 2)}\n`
}
