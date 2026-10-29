export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Limits = { edit: boolean; run: boolean; internet: boolean }

export type Agent = {
  name: string
  description: string
  model?: string
  effort?: Effort
  tools?: string[]
  disallowedTools?: string[]
  color?: string
  icon?: string
  limits: Limits
  gateway: string | null
  // Skills preloaded into the agent (Claude Code's `skills` key).
  skills?: string[]
  // Plugins the agent needs, as `<plugin>@<marketplace>` (under `deckhand:`).
  plugins?: string[]
  body: string
}

// One card: the agent, where it came from, and its file text for round trips.
// Built-in cards carry their catalog group and mascot hat.
export type DeckAgent = {
  agent: Agent
  source: 'project' | 'library' | 'builtin'
  isInLibrary: boolean
  text: string
  iconSvg?: string
  group?: string
  hat?: Hat
  // The type `$.agent.spawn` takes: the file name, or `deckhand:<name>`.
  agentType?: string
}

export type Hat = 'cap' | 'hardhat' | 'headphones' | 'beret' | 'antenna' | 'crown' | 'none'

// One agent loop shown in the Runs view, from spawn to its turn's end.
export type Run = {
  agentId: string
  title: string
  name: string
  model: string
  effort?: Effort
  color?: string
  hat: Hat
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'failed'
  tokens: number
  cost: number
  lastInput: number
  steps?: { done: number; total: number }
}

export type DeckTab = 'deck' | 'runs' | 'swarm' | 'skills'
export type SkillsView = { query: string; open: string | null; note: string }
export type SwarmMode = 'parallel' | 'lead'
export type SwarmDraft = { preset: string; picked: string[]; mode: SwarmMode; task: string; note: string | null }

// What the Deck's chips apply to this session, over the active agent's file.
export type Chips = { model?: string; effort?: Effort; limits: Limits }

export type RepeatMode = 'once' | 'x3' | 'm10' | 'm30' | 'm60'
export type Loop = { mode: RepeatMode; prompt: string; run: number; isInFlight: boolean }

export type Draft = { agent: Agent; editing: string | null; starter: string; note: string | null }
export type View = { kind: 'deck' } | { kind: 'form'; draft: Draft }

declare module 'claude-code' {
  interface PluginState {
    deckhand: {
      deck: DeckAgent[]
      active: string | null
      chips: Chips | null
      repeat: RepeatMode
      loop: Loop | null
      view: View
      menu: string | null
      confirm: string | null
      turnId: string | null
      tab: DeckTab
      collapsed: string[]
      runs: Run[]
      swarm: SwarmDraft
      swarmOpen: string | null
      setup: string | null
      enabledPlugins: string[]
      skillsPinned: string[]
      skillsView: SkillsView
    }
  }
}
