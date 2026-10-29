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
export type SwarmMode = 'pipeline' | 'parallel'

export type PipeKind = 'feature' | 'fix' | 'change' | 'cleanup'
export type PipeSize = 'tiny' | 'small' | 'normal' | 'big'
export type PipeStepId = 'research' | 'plan' | 'tests' | 'build' | 'review' | 'commit'
// gate: done, waiting for the owner's OK before the run goes on. blocked: a
// limit stopped it, or it changed nothing it was meant to. `note`: why the
// step runs as plain Claude Code.
export type PipeStep = { id: PipeStepId; agent: string | null; status: 'waiting' | 'running' | 'done' | 'gate' | 'failed' | 'blocked'; summary?: string; error?: string; note?: string }
// A step whose agent lacks a permission it needs, found at Start.
export type PipeShortfall = { step: PipeStepId; agent: string; missing: (keyof Limits)[] }
// One pipeline: `owner` is the agent in use when it started, put back at the
// end; `prompt` is the step prompt in flight, matched at its turn's end.
export type PipeRun = {
  id: string
  task: string
  kind: PipeKind
  size: PipeSize
  owner: string | null
  steps: PipeStep[]
  prompt: string | null
  note?: string
  ended?: 'done' | 'stopped' | 'failed'
  error?: string
  // Set when the plan turned out bigger than the size picked.
  sizeNote?: string
  // Review: merged findings, and `skeptic` while the skeptic checks them.
  findings?: Finding[]
  phase?: 'skeptic'
  // The limit guard's note from the step in flight, and the files' state
  // before a step that must edit.
  blocked?: string
  before?: string
}

export type Severity = 'critical' | 'high' | 'medium' | 'low'
// pending: serious, waiting for the skeptic; advice: medium or low.
export type Finding = {
  id: number
  severity: Severity
  file: string
  line: number
  title: string
  evidence: string
  reviewers: string[]
  verdict: 'pending' | 'confirmed' | 'refuted' | 'advice'
  proof?: string
}
// The Pipeline's choices (null: Auto, guessed from the task), the run, and the last
// run ids (the folders under .deckhand/pipeline/). `agents`: picked per step
// for the next run (null: plain Claude Code); `picking`: the step whose agent
// picker is open; `preflight`: why Start refused.
export type Pipeline = {
  kind: PipeKind | null
  size: PipeSize | null
  note: string
  run: PipeRun | null
  history: string[]
  agents?: Partial<Record<PipeStepId, string | null>>
  picking?: PipeStepId | null
  preflight?: PipeShortfall[]
}
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
      pipeline: Pipeline
      setup: string | null
      enabledPlugins: string[]
      skillsPinned: string[]
      skillsView: SkillsView
    }
  }
}
