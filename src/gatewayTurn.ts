// Answers a main-loop turn from Ollama or Codex instead of Claude.
import type { EngineInterface } from 'claude-code'

import type { Agent, Limits } from '../types'
import type { GatewayOptions, Turn } from './gateway'
import { codexArgv, codexPrompt, ollamaAnswer, ollamaRequest } from './gateway'

// The conversation with the outside model, kept by Deckhand: the engine's
// own messages are not readable from a hook. Reset when the agent changes.
let history: Turn[] = []
let historyOf = ''

export async function localAnswer($: EngineInterface, options: GatewayOptions, agent: Agent, model: string, prompt: string): Promise<string> {
  if (historyOf !== agent.name) {
    history = []
    historyOf = agent.name
  }
  const name = model === '' ? options.localModel : model
  history.push({ role: 'user', content: prompt })
  const reply = await $.http
    .fetch(`${options.localUrl}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ollamaRequest(name, agent.body, history) })
    .catch((error: unknown) => ({ ok: false, status: 0, text: String(error) }))
  const answer = reply.ok ? ollamaAnswer(reply.text) : undefined
  if (answer === undefined) {
    history.pop()
    return `Deckhand couldn't get an answer from the local model "${name}" at ${options.localUrl} (status ${reply.status}). Is Ollama running, and is the model pulled? Try \`ollama pull ${name}\`.`
  }
  history.push({ role: 'assistant', content: answer })

  return answer
}

export async function codexAnswer($: EngineInterface, options: GatewayOptions, agent: Agent, limits: Limits, prompt: string): Promise<string> {
  const argv = codexArgv(options.codexCommand, codexPrompt(agent.body, prompt), limits)
  const ran = await $.process.run(argv, { timeoutMs: 600_000 }).catch((error: unknown) => String(error))
  if (typeof ran === 'string') {
    return `Deckhand couldn't start Codex (\`${options.codexCommand}\`). Install the Codex CLI and sign in, then try again.\n${ran}`
  }
  const out = ran.stdout.trim()

  return ran.exitCode === 0 ? out || '(Codex finished with no output.)' : `Codex stopped with exit code ${ran.exitCode}.\n${ran.stderr.trim() || out}`
}
