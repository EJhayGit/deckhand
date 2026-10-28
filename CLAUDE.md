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
- Build all milestones on one branch (`build-v1`) with one PR, in the order
  `PLAN.md` gives. Commit after each milestone, running the checks below each
  time. Don't stop to ask between milestones.
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
- When the mod API can't do what the plan assumes, build the closest option,
  note it in the PR in plain words, and keep going.

## Architecture

- The repo root is both the plugin and its marketplace
  (`.claude-plugin/plugin.json` and `marketplace.json`).
- `hooks/register.tsx` only wires events to modules in `src/`. A `src/` helper
  that takes `$` must be a `function` declaration, or validate refuses it
  (`docs/decisions/0001-hooks-import-and-turn-cancel.md`).
- State atoms must be declared (`atom({ plugin: 'deckhand', key })`) in each
  file that reads or writes them; validate refuses one imported from another
  file. The contract for every key is `types/index.d.ts`.
- Pure modules (tested without the engine): `src/agents/format.ts`,
  `src/limits.ts`, `src/repeat.ts`, `src/models.ts`, `src/gateway.ts`,
  `src/ui/status.ts`.
- An active agent applies through hooks: `prompt.compose` adds its
  instructions, `turn.step` rewrites model and effort for the main loop only
  (`e.agentId === undefined`) or answers Local/Codex turns itself, and
  `tool.call` denies blocked tools for every loop.
- Tests use the memory world in `tests/world.ts` (files, store, toasts, runs,
  fetches). The engine hands hooks absolute paths; the world maps them back.
- Until the mod has loaded once, the API types aren't in `.claude-plugin/types/`:
  type-check with a temporary tsconfig that extends this one and includes the
  bundled `claude-code.d.ts` named by the plugin-authoring skill.
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
