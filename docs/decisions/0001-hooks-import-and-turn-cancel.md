# Hooks import from src/, and how to cancel a turn

Date: 2026-10-28. Checked against Claude Code 2.1.308 types (2.1.312 CLI).

## Can the hooks module import from src/?

Yes. Any `.ts`/`.tsx` file in the plugin can be imported with a static
`import` declaration (`import()` is refused). M0 proves it: `hooks/register.tsx`
imports `renderDeck` from `src/ui/deck.tsx`, and validate and the tests pass.

One catch: `claude plugin validate` follows `$` across an import only into a
**function declaration** (`export function renderDeck($, e) {}`), not an arrow
function bound to a const. Any helper in `src/` that takes `$` must be a
function declaration. Pure modules that never see `$` are unaffected.

So the PLAN.md layout stands: `register.tsx` stays short, logic lives in `src/`.

## How to cancel a running turn (for Stop, M5)

`$.turn.abort({ turnId })` cancels the main loop's running model turn and stops
its running tools. The `turnId` comes from a `turn.start` hook; keep it only
when `e.agentId === undefined` (main loop). It rejects if the id is not the
running turn's. Timers from `$.clock.after`/`every` are stopped with their own
`cancel()`.

## Type-checking

The engine writes the API types into `.claude-plugin/types/` only after it
loads the mod in a session (`claude --plugin-dir .` or an install). Until then
`tsc -p .` has no `claude-code` module; type-check with a throwaway tsconfig
that extends ours and includes the bundled `claude-code.d.ts` the
plugin-authoring skill names. `.claude-plugin/types/` is git-ignored since it is
regenerated per Claude Code version.
