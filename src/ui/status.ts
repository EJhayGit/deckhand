// Labels for chips and the status line. Pure: no `$`.
import type { Agent, Chips, Effort, Loop } from '../../types'
import { badges } from '../limits'

export const MODEL_CHIPS = [
  { id: undefined, label: 'Default' },
  { id: 'haiku', label: 'Haiku' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
  { id: 'codex', label: 'Codex' },
  { id: 'local', label: 'Local' },
] as const

export const EFFORT_CHIPS: readonly { id: Effort; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'XHigh' },
  { id: 'max', label: 'Max' },
]

// The word the Runs view and cards show before the model, colored by weight.
const WEIGHTS: Record<Effort, { word: string; color: string }> = {
  low: { word: 'light', color: '#30a46c' },
  medium: { word: 'medium', color: '#0090ff' },
  high: { word: 'careful', color: '#f5a524' },
  xhigh: { word: 'heavy', color: '#f76b15' },
  max: { word: 'heavy', color: '#e5484d' },
}

export function weightOf(effort: Effort | undefined): { word: string; color: string } | undefined {
  return effort ? WEIGHTS[effort] : undefined
}

export const COLORS: Record<string, string> = {
  red: '#e5484d',
  orange: '#f76b15',
  yellow: '#ffc53d',
  green: '#30a46c',
  blue: '#0090ff',
  purple: '#8e4ec6',
  pink: '#d6409f',
  gray: '#8b8d98',
}

export function modelLabel(model: string | undefined): string {
  if (model === undefined) return 'Default'
  const chip = MODEL_CHIPS.find(c => c.id === model)
  if (chip) return chip.label
  if (model.startsWith('local:')) return `Local ${model.slice(6)}`

  return model
}

export function iconText(agent: Agent): string {
  const icon = agent.icon
  if (icon && !icon.endsWith('.svg')) return icon

  return (agent.name[0] ?? '?').toUpperCase()
}

export function loopText(loop: Loop | null): string | undefined {
  if (!loop) return undefined
  if (loop.mode === 'x3') return `loop ${loop.run} of 3`

  return `loop ${loop.run}, every ${loop.mode.slice(1)} min`
}

export function statusText(agent: Agent, chips: Chips, loop: Loop | null): string {
  const parts = [
    `${iconText(agent)} ${agent.name}`,
    modelLabel(chips.model),
    chips.effort ? `${chips.effort} effort` : undefined,
    badges(chips.limits).join(', '),
    loopText(loop),
  ]

  return parts.filter(p => p !== undefined).join(' · ')
}
