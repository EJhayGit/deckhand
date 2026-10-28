# Swarms and the Runs view

Date: 2026-10-28.

## What was asked

Optional swarms or orchestration, and a panel like the owner's "Agents"
screenshot: mascots, model and effort, steps, ctx, tokens, cost, time,
colored progress bars, Running and Finished groups, and totals.

## What was built

- **Swarm tab**, off unless used. Two modes:
  - **Parallel:** Deckhand sends one prompt to the chat, as the person's own,
    naming each picked agent's type and part, and Claude starts them in the
    background with its Agent tool. Presets: Launch kit, Security sweep, Ship
    check, or a custom pick. The built-ins are offered to the model until
    that turn ends.
  - **Lead:** swarm-lead becomes the active agent and the task goes to the
    chat. It splits the work and hands parts to deck agents with the Agent
    tool. While it is in use, the built-ins are offered to the model.
  - `/deck swarm <preset|lead> <task>` does the same.
- **Runs tab:** a row per agent the session started, from the model or a
  swarm. `agent.spawn` adds the row, each `turn.step` of that agent updates
  tokens, ctx and cost, `turn.complete` ends it, and a `deck_progress` tool
  lets an agent report `done/total` steps. A one-second clock redraws only
  while something runs.
- The weight word comes from effort: low light, medium medium, high careful,
  xhigh and max heavy. The XHigh effort chip was added for it.

## Choices

- **swarm-lead allows everything.** The `tool.call` guard applies the active
  agent's limits to every loop, subagents included, so a read-only lead would
  stop its workers from editing. Its instructions forbid doing the work
  itself, and each worker keeps its own `tools` and `disallowedTools`.
- **Parallel agents hold their own limits.** No agent is active during a
  parallel swarm, so the guard has nothing to apply; each agent's registered
  tool lists hold it, as for any subagent.
- **Cost is an estimate**, from list prices in `src/models.ts`. There is no
  cap, as `PLAN.md` decided.
- **Tokens and ctx show the latest request**, since each step re-reads the
  conversation; cost adds up over every request.

- **Parallel goes through the chat, not `$.agent.spawn`.** The first live try
  spawned directly from the Start button, and auto mode's safety check
  refused every agent: nothing in the conversation asked for them. A visible
  prompt puts the request in the transcript, and the model's own spawns pass
  through Deckhand's `agent.spawn`, `turn.step` and `tool.call` hooks, so the
  Runs view and the limit guard see them.

## Limits of the build
- Local and Codex agents answer only the main chat, so a swarm skips them.
- Nothing stops two parallel agents from editing the same file. The part
  prompt tells each one to stay in its part.
