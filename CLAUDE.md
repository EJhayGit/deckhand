# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Deckhand is a Claude Code mod: a deck of reusable agents beside the chat, with
chips for model, effort, limits and repeat. `PLAN.md` is the source of truth for
scope, design and milestones.

At the start of every session, read `PLAN.md` and `docs/handoff.md`. Update
`docs/handoff.md` (state, next step, open items) before ending a session that
changed anything.

`docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md` and `docs/TESTING.md` are empty
starter templates; `PLAN.md` wins over them. Design choices go in
`docs/decisions/`, one short file each.

## Rules

- Load the `plugin-authoring` skill before writing or changing mod code.
- Work inline in the session. Don't use subagents or per-task implementer or
  reviewer agents; the owner considers them a waste of tokens.
- Build one milestone per branch and per PR, in the order `PLAN.md` gives.
- Automated tests never make paid model calls. Use the mocked clock for timers.
- Limits are enforced in the `tool.call` guard, which fails closed. Never
  weaken a limit test to make it pass.
- No budget caps and no required tests or verification gates. The owner
  decided this.
- Never write global Claude Code settings (`~/.claude/...`) without a confirm
  button the owner presses.
- Keep pure logic (agent format, limits, repeat) free of `$` so it tests
  without the engine.
- Add no runtime dependency without a clear need and a `docs/decisions/` note.
- When the mod API can't do what the plan assumes, stop and tell the owner in
  plain words with the closest option.

## Architecture (planned, see PLAN.md sections 4 and 8)

- The repo root is both the plugin and its marketplace
  (`.claude-plugin/plugin.json` and `marketplace.json`).
- `hooks/register.tsx` only wires events to modules in `src/`. Whether the hooks
  module can import from `src/` is an M0 unknown; if it can't, pure logic lives
  in `hooks/` next to it.
- Pure modules: `src/agents/format.ts` (agent Markdown round trip, keeps unknown
  keys and body), `src/limits.ts`, `src/repeat.ts` (clock injected). The
  `$.state` contract is in `types/index.d.ts`.
- An active agent applies through three hooks: `prompt.compose` adds its
  instructions, `turn.step` rewrites model and effort for the main loop only
  (`e.agentId === undefined`), and `tool.call` denies blocked tools.
- Check mod API calls by grepping `.claude-plugin/types/claude-code/index.d.ts`
  rather than reading the whole file.

## Checks before claiming done

```sh
claude plugin validate .
tsc -p .
claude plugin test .
```

Also read the diff before committing. Report what changed, what you checked,
and anything left open.

## Talking to the owner

The owner prefers clicking to typing and plain language. Lead with the result,
keep replies short, and say exactly what to click or run to try something.
