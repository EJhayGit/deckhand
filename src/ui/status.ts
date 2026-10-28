// Labels for chips and cards. Pure: no `$`.
import type { Agent, Effort } from '../../types'
import { CLAUDE_IDS, modelName } from '../models'

// Ids stay aliases so saved agents keep working; labels show the version.
export const MODEL_CHIPS = [
  { id: undefined, label: 'Default' },
  { id: 'haiku', label: modelName('haiku') },
  { id: 'sonnet', label: modelName('sonnet') },
  { id: 'opus', label: modelName('opus') },
  { id: 'fable', label: modelName('fable') },
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

// Cards name Claude models with their version ("Opus 5.5"); others as chips do.
export function modelText(model: string | undefined): string {
  return model !== undefined && CLAUDE_IDS[model] ? modelName(model) : modelLabel(model)
}

export function iconText(agent: Agent): string {
  const icon = agent.icon
  if (icon && !icon.endsWith('.svg')) return icon

  return (agent.name[0] ?? '?').toUpperCase()
}
