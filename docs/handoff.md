# Handoff

## State

- 0.3.3 (builder agent) is merged (PR #15) and tagged `v0.3.3`.
- **0.4.0 is on branch `claude/swarm-pipeline-issues-b16336`, one PR, not
  merged** (`docs/decisions/0013-pipeline-through-chat.md`):
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

The live run passed. Merge PR #16 when happy, then tag `v0.4.0`.

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
