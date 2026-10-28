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
  body: string
}

// One card: the agent, where it came from, and its file text for round trips.
export type DeckAgent = {
  agent: Agent
  source: 'project' | 'library'
  isInLibrary: boolean
  text: string
  iconSvg?: string
}

// What the chip band applies to this session, over the active agent's file.
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
    }
  }
}
