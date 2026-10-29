# Review fix loop, and one agent per step

Date: 2026-10-29. Replaces the "Fix these first" button (0009) and Build's
"agent in use if it can edit and run" rule (0011).

## What was asked

Change at a paused Review only reran the reviewers. Send the findings back
to Build, then re-review, with brakes so the loop can't run away. Each step
must run on its own agent, never the one in use.

## What was built

- **Gate.** The Review gate lists the merged findings with a checkbox each
  (a ☑/☐ button: the mod API has no checkbox). Ticked by default: medium and
  up that the skeptic didn't refute (`picksByDefault`). The owner's toggle is
  saved on the finding (`pick`). Buttons: Fix these, Approve, Stop. Change at
  Review calls the same fix.
- **One round.** Fix these writes the ticked findings and the note to
  `.deckhand/pipeline/<run>/<nn>-fixes.md` (`nn`: Build's step number; each
  round overwrites it), snapshots the tree with `git stash create` (empty:
  `HEAD`), and sends Build back (`after(run, { kind: 'fix' })`). Build's
  prompt says to read that file and fix only those items. Review then diffs
  against the snapshot, so it reads that round's change only, and its prompt
  tells the reviewers to re-report any fixes-file item still there.
- **Next state** (`progress` in `src/findings.ts`, pure), after each round's
  review, comparing by file plus normalized evidence:
  - clean: nothing left that would be ticked → back to the gate.
  - rising: more new findings than fixed → brake, both lists shown.
  - no progress: the same findings back, or the count didn't drop → brake.
  - cap: the round reached Max rounds (chip, 1 to 5, default 3) → brake.
  - otherwise the next round starts by itself with the default ticks.
  A brake returns to the gate with the reason and the same three buttons;
  Fix these there runs one more round.
- **State** (`types/index.d.ts`): `PipeRun.round`, `cap`, `previous` (the
  review sent to Build, with its ticks), `brake`, `base`; `Finding.pick`;
  `Pipeline.rounds` (the chip).
- **Own agents.** `agentFor('build')` is the builder, or bug-fixer for a Fix
  (falling back to the builder). The agent in use is never a step's agent.
  `sendStep` re-runs the preflight on the step about to start, so an agent
  put on a step mid-run that can't do it fails the step with
  `Build: reviewer is missing Edit files. Pick an agent that can, then start
  again.` A missing fixes file fails Build too.
- **Prompts** start with the agent's name (`Start the \`deckhand:builder\`
  agent to run this Deckhand Pipeline step`), and Review's with every
  reviewer's, so auto mode sees the start was asked for.
- **Cost.** Spawns in a round are titled `Round 2/3 · Build` (and
  `Round 2/3 · Review (reviewer)`); the step cards sum each round's Runs rows
  (`roundTotals`).

## Limits

- "Review the new diff only": untracked files aren't in `git stash create`,
  so a round's review still lists every untracked file as new.
- Later rounds tick by the defaults; the owner's earlier unticks don't carry
  over to findings that come back.
- Round totals match Runs rows by title and by start time after the run's
  id; rows cleared from Runs drop out of the totals.
