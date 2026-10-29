# Handoff

## State

- 0.3.3 (builder agent) is merged (PR #15) and tagged `v0.3.3`.
- **0.4.0 is on branch `claude/swarm-pipeline-issues-b16336`, one PR, not
  merged** (`docs/decisions/0013-pipeline-through-chat.md`):
  - Every Pipeline step goes through the chat. The step's agent is captured
    in the `agent.spawn` hook, forced to the foreground, and only its own
    answer finishes the step. This fixes the live bug where Plan said "needs
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
- Live testing of unmerged changes runs from the session's dev-mod copy in
  `~/.claude/dev-mods/<session>/deckhand/` (hooks, src, types and
  plugin.json), with the marketplace deckhand turned off.

## Next step

Owner, from the dev-mod copy, with the marketplace deckhand turned off (it's
0.3.1, and two copies fight):

1. Check the panel title says `Deck v0.4.0`.
2. Swarm tab: type a task, pick **Big**, click **Start**. The chat gets the
   Research prompt and starts researcher. Researcher should only search and
   fetch the web.
3. The chat turn stays busy until researcher finishes. Then Plan goes in by
   itself, and stops at **needs OK** with the architect's real plan (not "I'll
   pass on its answer").
4. Approve through to Commit: the committer makes the commits.
5. If a step blocks with "The chat didn't start …", auto mode refused the
   model's Agent call: tell me, because that changes the design.
6. Merge the PR when happy.

## Open items

- Owner's open questions from the master plan, built with these defaults:
  Lead is removed (with swarm-lead); the swap list as given. Build now uses
  the agent in use only if it can edit and run (decision 0011).
- Live: auto mode refused the plugin's own `$.agent.spawn` from Start (seen
  2026-10-29), so 0.4.0 sends every step through the chat. Still to confirm
  live: the `background: false` rewrite in `agent.spawn` holds for the
  model's Agent call, and the chat starts the agent from the step prompt.
  Stop can't kill a running agent; its late answer is ignored.
- Researcher's explicit `tools` list includes `mcp__deckhand__deck_progress`;
  unconfirmed that an MCP tool name in a registered agent's list resolves.
- silent-failure-hunter isn't in Review's reviewer list; add it there if the
  owner wants it to run on every Review.
- "Changed nothing" compares `git status` + `git diff HEAD` before and after
  Tests/Build; gitignored-only changes count as nothing, and Commit isn't
  checked. Still to confirm live that the guard's denial reaches the step.
- Still to confirm live: a Pipeline turn's `turn.start` text equals the
  submitted prompt (the swarm relies on the same match); `$.command.run` from
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
