# Handoff

## State

- 0.3.2 is merged (PR #14), tagged `v0.3.2` with a GitHub release, and is
  the marketplace install.
- **0.3.3 is on branch `claude/builder-agent`, one PR, not merged:** a new
  built-in `builder` agent (`src/agents/starters.ts`, from the owner's
  `builder.md`, adapted from ECC and credited in `THIRD_PARTY_NOTICES.md`).
  Build's fallback in `agentFor` (`src/pipeline.ts`) is now the builder
  instead of fixer / bug-fixer.
- Checks pass: `claude plugin validate .` (the usual no-icon warning), `tsc`
  with the bundled types, `claude plugin test .` (137 tests).
- The test world (`tests/world.ts`) now maps paths correctly inside a git
  worktree (the worktree's own path holds `.claude/`), answers
  `command.list` / `command.run`, and gives per-command `process.run`
  output (`w.outputs`). It also answers a plugin's own `$.agent.spawn`,
  which the test engine sends shaped like the Agent tool (`subagent_type`
  in, `result.agentId` out), and `w.spawnDeny` makes it refuse.
- Live testing of unmerged changes runs from the session's dev-mod copy in
  `~/.claude/dev-mods/<session>/deckhand/` (hooks, src, types and
  plugin.json), with the marketplace deckhand turned off.

## Next step

Owner, from the dev-mod copy, with the marketplace deckhand turned off (it's
0.3.1, and two copies fight):

1. Deck: **Use** researcher. Swarm tab: type a small task, pick **Small**,
   click **Start**.
2. Nothing is typed into the chat. The Runs tab shows `Pipeline 1/4 · Tests`
   (test-writer) working, then Build (builder). The Deck still says
   researcher.
3. If a step shows "Claude Code didn't start …", auto mode refused the spawn:
   click **Send through chat** and tell me, because that changes the design.
4. Merge the PR when happy.

## Open items

- Owner's open questions from the master plan, built with these defaults:
  Lead is removed (with swarm-lead); the swap list as given. Build now uses
  the agent in use only if it can edit and run (decision 0011).
- Live unknowns for 0.3.2: whether auto mode allows a plugin's
  `$.agent.spawn` from a button, and whether the live result carries
  `agentId` as documented (the test engine returns it in `result`). Stop
  can't kill a running subagent; its late answer is ignored.
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
