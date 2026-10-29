# Pipeline

Date: 2026-10-29.

## What was asked

Rework the Swarm tab around a Pipeline modeled on ECC's `orch-pipeline`: a
task runs through ordered steps, each building on the last, with the owner's
OK after Plan and before Commit (`PLAN.md` 14, Milestone 3).

## What was built

- **Kind and size:** Feature, Fix, Change, Clean up; Tiny, Small, Normal,
  Big. Both are suggested from the task text (`src/pipeline.ts`) and the
  owner can change them. Security or public-API words make it at least
  Normal. The size picks the steps from the plan's table.
- **Every step runs in the main chat, with that step's agent in use.** The
  plan expected step agents to write their own result files because the mod
  can't read a subagent's answer. But the mod does see the main chat's answer
  (`turn.complete`'s `answer`). So Deckhand makes the step's agent active,
  submits the step prompt as the owner's own, and writes the answer to
  `.deckhand/pipeline/<run>/<nn>-<step>.md` itself. This means read-only
  agents (planner, architect, reviewer) never need write access, and each
  step's limits are enforced by the existing `tool.call` guard, unchanged.
- **One step per turn.** At the turn's end the step is done; the next one is
  submitted, or the run stops at a gate. A gate shows the result in short
  form with Approve, Change (re-runs the step with a note) and Stop.
- **Build and Commit** use the agent that was in use when the run started
  (none: plain Claude Code). That agent is put back when the run ends.
- **Runs** gets a row per step, like `Pipeline 3/5 · Tests`, with the turn's
  tokens and cost.
- **Modes:** Pipeline (default) and Parallel. Lead and the swarm-lead agent
  were removed (owner's choice, 2026-10-29): Pipeline covers the same ground
  with the owner's OK, and swarm-lead needed every limit on so its workers
  weren't blocked. A swarm draft saved in Lead mode opens as Pipeline.

## Limits of this build

- `$.fs` can't delete, so "keep only the last 20 runs" keeps 20 run ids in
  state; older folders stay on disk. `.deckhand/` is gitignored.
- An interrupted, refused or failed turn fails the step and ends the run;
  the owner starts a new one.
