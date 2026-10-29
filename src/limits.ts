// Limits -> tool lists, and the tool.call decision. Pure: no `$`.
import type { Agent, Limits } from './agents/format'

export type Limit = keyof Limits

// PowerShell runs commands too (the Windows shell tool), so Run commands covers it.
export const LIMIT_TOOLS: Record<Limit, readonly string[]> = {
  edit: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'],
  run: ['Bash', 'PowerShell'],
  internet: ['WebFetch', 'WebSearch'],
}

export const LIMIT_LABEL: Record<Limit, string> = {
  edit: 'Edit files',
  run: 'Run commands',
  internet: 'Internet',
}

const LIMITS = Object.keys(LIMIT_TOOLS) as Limit[]

export function limitOf(tool: string): Limit | undefined {
  return LIMITS.find(limit => LIMIT_TOOLS[limit].includes(tool))
}

// The limit that blocks `tool`, or undefined when it may run.
export function blockingLimit(limits: Limits, tool: string): Limit | undefined {
  const limit = limitOf(tool)
  return limit !== undefined && limits[limit] !== true ? limit : undefined
}

// The agent's tools with its limits applied: blocked tools leave `tools` and
// join `disallowedTools`; allowed limit tools leave `disallowedTools`.
export function toolLists(agent: Agent): { tools?: string[]; disallowedTools?: string[] } {
  const blocked = LIMITS.filter(l => !agent.limits[l]).flatMap(l => LIMIT_TOOLS[l])
  const allowed = LIMITS.filter(l => agent.limits[l]).flatMap(l => LIMIT_TOOLS[l])
  const tools = agent.tools?.filter(t => !blocked.includes(t))
  const others = (agent.disallowedTools ?? []).filter(t => !blocked.includes(t) && !allowed.includes(t))
  const disallowedTools = [...others, ...blocked]

  return { tools, disallowedTools }
}

// Whose limits hold for a loop: its own (a deck subagent, or a Pipeline
// step's), else the agent in use. Neither: no limits.
export function limitsFor<T>(own: T | undefined, active: T | undefined): T | undefined {
  return own ?? active
}

export function badges(limits: Limits): string[] {
  const on = [
    limits.edit && 'edits files',
    limits.run && 'runs commands',
    limits.internet && 'internet',
  ].filter((b): b is string => typeof b === 'string')

  return on.length === 0 ? ['read only'] : on
}

export function blockedNote(agentName: string, tool: string, input: Record<string, unknown>, limit: Limit): string {
  const what = String(input.command ?? input.file_path ?? input.notebook_path ?? input.url ?? input.query ?? tool)
  const short = what.length > 60 ? `${what.slice(0, 57)}...` : what
  const verb = limit === 'run' ? 'run' : limit === 'edit' ? 'edit' : tool === 'WebSearch' ? 'search for' : 'fetch'

  return `Blocked: ${agentName} tried to ${verb} \`${short}\`, but ${LIMIT_LABEL[limit]} is off for this agent.`
}
