# Handoff

## State

- 0.2.0 is released (PR #6, tag `v0.2.0`, MIT). 0.2.1 is merged (PR #9),
  not tagged. `band-layout` is merged (PR #11): the agent chips sit at the
  top of the Deck tab.
- **0.3.0 is built on branch `claude/deckhand-master-plan-f696d7`, one PR,
  not merged.** It is `PLAN.md` section 14, all four milestones, one commit
  each:
  1. **Skills tab** (`src/skills.ts`, `src/ui/skills.tsx`, decision 0008):
     lists skills from `$.command.list()`, runs one with `$.command.run`
     (the host refuses a `/…` prompt from a plugin), pins in
     `.claude/deckhand/skills.json`, Add to agent.
  2. **ECC agents** (`src/agents/starters.ts`, `THIRD_PARTY_NOTICES.md`,
     decision 0006): seven built-ins take ECC's bodies under their old ids;
     architect and typescript-reviewer are new.
  3. **Pipeline** (`src/pipeline.ts`, `src/pipelineRun.ts`,
     `src/ui/swarm.tsx`, decision 0007): each step runs in the main chat with
     its agent active; the mod saves the turn's answer to
     `.deckhand/pipeline/<run>/<nn>-<step>.md`.
  4. **Review + skeptic** (`src/findings.ts`, decision 0009): reviewers fan
     out, findings merge by snippet, the new skeptic agent confirms or
     refutes the serious ones; Fix these first.
  Then, at the owner's request: **Lead mode and swarm-lead removed**
  (Parallel stays), and **Auto** chips for Kind and Size (decision 0010).
- Checks pass: `claude plugin validate .` (the usual no-icon warning), `tsc`
  with the bundled types, `claude plugin test .` (122 tests).
- The test world (`tests/world.ts`) now maps paths correctly inside a git
  worktree (the worktree's own path holds `.claude/`), answers
  `command.list` / `command.run`, and gives per-command `process.run`
  output (`w.outputs`).
- Live testing of unmerged changes runs from the session's dev-mod copy in
  `~/.claude/dev-mods/<session>/deckhand/` (hooks, src, types and
  plugin.json), with the marketplace deckhand turned off.

## Next step

Owner, from the dev-mod copy (marketplace deckhand off):

1. **Skills:** open the Skills tab; check real skills list, Search, ☆ pin,
   and Run on one (e.g. a document skill with a note).
2. **Agents:** Use reviewer, then planner, on a small task; check the new
   instructions show (longer checklists, ECC-style plan format).
3. **Pipeline:** Swarm tab → type a small bug fix → Kind Fix, Size Normal →
   Start (or leave both on Auto and check the reason line). Approve after Plan; let Tests and Build run; check the Review step
   starts the reviewers and the skeptic; at the Commit stop, try Fix these
   first or Approve. Plant a real bug to see it survive the skeptic.
4. Merge the PR when happy.

## Open items

- Owner's open questions from the master plan, built with these defaults:
  Lead is removed (with swarm-lead); Build and Commit use the agent in use
  when the run started (none: plain Claude Code); the swap list as given.
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
