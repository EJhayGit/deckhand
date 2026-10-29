# Handoff

## State

- **0.5.0 is on branch `claude/deck-da3e4a`, PR #17, not merged**
  (`docs/decisions/0014-card-deck.md`, PLAN §15). The deck as cards:
  - Agents are 24-column cards in a wrapping grid (icon, name, status from
    `cardStatus` in `src/ui/status.ts`, model, short limit badges). "⋯"
    opens a detail panel with **Put on step** (calls `pickAgent`).
  - A Skills row of small cards on the Deck tab; the Skills tab uses cards.
  - Pipeline steps draw as a row of step cards in `src/ui/swarm.tsx`; the
    picker uses `renderMiniCard` (`src/ui/miniCard.tsx`, its own file so
    deck.tsx and swarm.tsx don't import each other).
  - No new state keys; every button key is unchanged.
  - Built by a Deckhand Pipeline run (20261029-102335); review fixes made
    inline. Checks: validate passes, 149 tests pass. `tsc` was not run
    (TypeScript isn't installed in that worktree).
- 0.4.0 (PR #16) is merged.
- Earlier 0.4.0 notes (`docs/decisions/0013-pipeline-through-chat.md`):
  - Every Pipeline step goes through the chat. The step's agent is captured
    in the `agent.spawn` hook and only its own answer finishes the step
    (Deckhand asks for the foreground; the desktop app runs it in the
    background anyway, and the step still waits). This fixes the live bug where Plan said "needs
    OK" while the architect was still running in the background. Send
    through chat is gone.
  - New built-ins: committer (the Commit step's agent), code-explorer,
    silent-failure-hunter, code-simplifier (from ECC `25278e7`). Researcher
    is web only (explicit `tools`). docs-writer gets Run commands. builder no
    longer commits per slice.
  - The agent in use is told which tools are off (`offText`).
  - The Deck title shows the version from the plugin's `plugin.json`.
- Checks pass: `claude plugin validate .` (the usual no-icon warning), `tsc`
  with the bundled types, `claude plugin test .` (141 tests). The test world
  plays the chat's part (`playChat`, `agentEnds` in `tests/world.ts`).
- The test world (`tests/world.ts`) now maps paths correctly inside a git
  worktree (the worktree's own path holds `.claude/`), answers
  `command.list` / `command.run`, and gives per-command `process.run`
  output (`w.outputs`). It also answers a plugin's own `$.agent.spawn`,
  which the test engine sends shaped like the Agent tool (`subagent_type`
  in, `result.agentId` out), and `w.spawnDeny` makes it refuse.
- **Confirmed live 2026-10-29:** a Normal run in a throwaway repo
  (`C:\Development\Projects\deckhand-sandbox`, safe to delete) built a
  landing page through all five steps, waiting for each agent, and the
  committer made two clean commits. Details in decision 0013.
- Live testing of unmerged changes runs from the session's dev-mod copy in
  `~/.claude/dev-mods/<session>/deckhand/` (hooks, src, types and
  plugin.json), with the marketplace deckhand turned off.

## Next step

Owner, from the dev-mod copy, with the marketplace deckhand turned off (it's
0.3.1, and two copies fight):

Open the Deck from the dev-mod copy and check the cards in the terminal and
the desktop app: card width, hover borders, emoji icons lining up with the
borders, Put on step, and a Pipeline run moving across the step cards. Then
merge PR #17 and tag `v0.5.0` (tag `v0.4.0` too if it isn't yet).

Left-over low review items on PR #17 (not fixed, by the owner's choice):
Put on step after an ended run isn't visible until Clear; dead skill cards
for uninstalled pinned skills; step notes don't name their step; "needs
<plugin>" can overflow a narrow card.

Possible follow-up: Review gets an empty diff when every file is new; adding
untracked files to the saved diff (`git add -N` or `git diff --no-index`)
would give the reviewers the real text.

## Open items

- Owner's open questions from the master plan, built with these defaults:
  Lead is removed (with swarm-lead); the swap list as given. Build now uses
  the agent in use only if it can edit and run (decision 0011).
- Live: auto mode refuses the plugin's own `$.agent.spawn` from Start, so
  0.4.0 sends every step through the chat (works). The `background: false`
  rewrite is ignored by the desktop app; harmless. Stop can't kill a running
  agent; its late answer is ignored.
- silent-failure-hunter isn't in Review's reviewer list; add it there if the
  owner wants it to run on every Review.
- "Changed nothing" compares `git status` + `git diff HEAD` before and after
  Tests/Build; gitignored-only changes count as nothing, and Commit isn't
  checked. Still to confirm live that the guard's denial reaches the step.
- Still to confirm live: `$.command.run` from
  a button runs a plugin skill; each reviewer's own answer is only its
  finding lines (the chat passes them that instruction).
- The Skills tab can't tell project from personal skills (the API says only
  `user`), so both show as Yours; a plugin's markdown commands show too.
- `$.fs` can't delete: old `.deckhand/pipeline/` folders stay (gitignored);
  state keeps the last 20 run ids.
- Security triggers in `src/findings.ts` are broad (`url`, `request`,
  `session`): they lean toward adding security-auditor.
- Earlier items: model prices in `src/models.ts` are from 2026-10; `launch/`
  ships in the plugin (~90 KB); README has no screenshots; PNG icons in an
  SVG `<image>` are unverified on desktop; the plugin has no
  `.claude-plugin/icon.png`.
