// Local (Ollama) and Codex turns that Deckhand answers itself. Pure: no `$`.
import type { Limits } from '../types'

export type Turn = { role: 'user' | 'assistant'; content: string }

export type GatewayOptions = { localUrl: string; localModel: string; codexCommand: string }

export const DEFAULTS: GatewayOptions = {
  localUrl: 'http://localhost:11434',
  localModel: 'llama3.2',
  codexCommand: 'codex',
}

export const LOCAL_HINT = 'Local models answer in text only here: no tools, files or commands.'
export const CODEX_HINT = 'Codex works in this folder with its own tools; Edit files off keeps it read only.'

export function gatewayOptions(options: Readonly<Record<string, unknown>>): GatewayOptions {
  const pick = (key: keyof GatewayOptions) => {
    const value = options[key]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULTS[key]
  }

  return { localUrl: pick('localUrl').replace(/\/+$/, ''), localModel: pick('localModel'), codexCommand: pick('codexCommand') }
}

// Ollama's own chat API, one reply, no streaming.
export function ollamaRequest(model: string, system: string, history: readonly Turn[]): string {
  const messages = [...(system.trim() === '' ? [] : [{ role: 'system', content: system }]), ...history]

  return JSON.stringify({ model, messages, stream: false })
}

export function ollamaAnswer(text: string): string | undefined {
  try {
    const content = (JSON.parse(text) as { message?: { content?: unknown } }).message?.content
    return typeof content === 'string' ? content : undefined
  } catch {
    return undefined
  }
}

// Codex runs in its own sandbox: it may write the project only with Edit files on.
export function codexArgv(command: string, prompt: string, limits: Limits): string[] {
  return [command, 'exec', '--skip-git-repo-check', '--sandbox', limits.edit ? 'workspace-write' : 'read-only', prompt]
}

export function codexPrompt(instructions: string, task: string): string {
  return instructions.trim() === '' ? task : `${instructions.trim()}\n\nTask: ${task}`
}
