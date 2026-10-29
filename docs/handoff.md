# Handoff

## State

- 0.3.0 is merged (PR #12), not tagged.
- **0.3.1 is on branch `claude/pipeline-per-step-agents-0373cb`, one PR, not
  merged:** Pipeline step agents (decision 0011, replaces 0007's "Build uses
  the agent in use" rule). Each step gets a suited agent (`agentFor` in
  `src/pipeline.ts`), with an **agent** chip per step to pick another for one
  run; Start runs a preflight (`preflight`) and refuses a step whose agent
  lacks a permission; a step blocked by the limits, or Tests/Build changing
  nothing in git, stops the run with Retry / Change agent / Stop. The limit
  guard in `hooks/register.tsx` now tells the pipeline about main-chat
  denials (`onPipelineBlocked`).
- Checks pass: `claude plugin validate .` (the usual no-icon warning), `tsc`
  with the bundled types, `claude plugin test .` (132 tests).
- The test world (`tests/world.ts`) now maps paths correctly inside a git
  worktree (the worktree's own path holds `.claude/`), answers
  `command.list` / `command.run`, and gives per-command `process.run`
  output (`w.outputs`).
- Live testing of unmerged changes runs from the session's dev-mod copy in
  `~/.claude/dev-mods/<session>/deckhand/` (hooks, src, types and
  plugin.json), with the marketplace deckhand turned off.

## Next step

Owner, from the dev-mod copy (marketplace deckhand off):

1. Deck: **Use** researcher. Swarm tab → type a small task → Size Small. The
   step list shows test-writer for Tests and bug-fixer for Build. Start:
   Tests runs as test-writer (the Deck says "In use: test-writer").
2. Click Tests' **agent** chip → researcher → Start: it refuses and names the
   missing permissions. Click **Use plain Claude Code for this step**.
3. Let a step finish without changing files: it shows **blocked** with Retry.
4. Merge the PR when happy.

## Open items

- Owner's open questions from the master plan, built with these defaults:
  Lead is removed (with swarm-lead); the swap list as given. Build now uses
  the agent in use only if it can edit and run (decision 0011).
- "Changed nothing" compares `git status` + `git diff HEAD` before and after
  Tests/Build; gitignored-only changes count as nothing, and Commit isn't
  checked. Still to confirm live that the guard's denial reaches the step.
- Still to confirm live: a Pipeline turn's `turn.start` text equals the
  submitted prompt (the swarm relies on the same match); `$.command.run` from
  a button runs a plugin skill; the reviewers' finding lines come back as
  plain JSON lines in the main answer.
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
