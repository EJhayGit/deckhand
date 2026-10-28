# Codex and local models (M7)

Date: 2026-10-28. Checked against the Claude Code 2.1.308 mod API types.

## What the plan asked

PLAN.md section 9 listed three options, in order:
1. A gateway per agent: rewrite the model in `turn.step`, or point
   `ANTHROPIC_BASE_URL` at Ollama, LiteLLM or LM Studio with `$.env.set`.
2. A gateway for the whole session, applied on restart.
3. A hand-off to the Codex CLI.

## What the API allows

- `turn.step` can rewrite `model`, but the request still goes to the
  session's own API client. A gateway model name sent to Anthropic's API fails.
- `$.env.set` changes the environment of "this process and everything it
  starts after". The types don't say the running API client re-reads it, and
  checking would need a live model call. Treat option 1 as not available.
- A `turn.step` hook **can answer the step itself** without calling `next`:
  it yields text chunks and a stop, and the engine shows and records them as
  the model's reply. Option 2 would also need a global settings write, which
  CLAUDE.md forbids without a confirm button.

## What was built

A per-agent route inside the session, closest to option 1, using that last
point:

- **Local:** the model chip "Local", or `model: local` / `model: local:<name>`
  in the agent file. Deckhand sends the turn to Ollama's `/api/chat` with
  `$.http.fetch` and streams the answer back as the reply. The agent's
  instructions are the system prompt. Deckhand keeps the conversation itself,
  since a hook can't read the engine's messages.
- **Codex:** the model chip "Codex", or `model: codex`. Deckhand runs
  `codex exec --sandbox read-only|workspace-write <prompt>` in the project
  folder with `$.process.run` and returns its output as the reply. The sandbox
  is `workspace-write` only when Edit files is on.
- Settings: `localUrl` (default `http://localhost:11434`), `localModel`
  (default `llama3.2`) and `codexCommand` (default `codex`) are the mod's
  `userConfig` options.
- Only main-loop turns are routed. Subagents keep Claude.

## Limits of this approach

- Local answers are text only: the local model can't call Claude Code's
  tools, so it reads no files and runs nothing. The card and band say so.
- Codex uses its own tools inside its own sandbox. Deckhand's `tool.call`
  guard doesn't see them. Edit files off maps to Codex's read-only sandbox,
  but Run commands and Internet aren't enforced inside Codex.
- Neither path streams token by token: Local waits for Ollama's full reply,
  and Codex for the run to end (up to 10 minutes).
- `deckhand.gateway` in the agent format stays `null`. The model field
  carries the route instead (`local`, `local:<name>`, `codex`).
- LM Studio and LiteLLM aren't wired: only Ollama's API is spoken.
- Not tried live: Ollama and Codex aren't installed on the build machine.
  Tests mock the HTTP and process calls.
