# Pipeline step agents, preflight and blocked steps

Date: 2026-10-29. Replaces 0007's rule "Build and Commit use the agent that
was in use when the run started".

## What was asked

Every step used to fall back to the agent in use at Start for Build and
Commit. With a read-only agent in use (say researcher), Build couldn't edit,
and the run moved on anyway. Give each step an agent suited to it, let the
owner see and change it, refuse to start a run that can't work, and stop a
step that got blocked.

## What was built

- **Step agents** (`agentFor` in `src/pipeline.ts`, pure):

  | Step | Agent | Needs |
  | --- | --- | --- |
  | Research | researcher | internet |
  | Plan | planner (architect for Big) | read only |
  | Tests | test-writer | edit, run |
  | Build | agent in use if it can edit and run, else fixer, else bug-fixer, else plain Claude Code | edit, run |
  | Review | reviewer (+ security-auditor on the existing triggers) | read only |
  | Commit | plain Claude Code | edit, run |

  A default agent that isn't in the deck falls back to plain Claude Code, and
  the step card says so. The agent in use at Start is put back when the run
  ends, stops or is blocked.
- **Pick per step:** each step lists its agent with a small **agent** chip
  (key `agent-<step>`) that opens a picker of the deck's agents plus plain
  Claude Code. Picks last for one run; **New pipeline** clears them.
- **Preflight:** Start checks every step's agent against the table above. If
  one falls short it doesn't start and says which step and permission, with
  **Use plain Claude Code for this step**.
- **Blocked:** a step is blocked, and the run waits there with **Retry**,
  **Change agent** and **Stop**, when:
  - the limit guard denied a main-chat tool call the step needs (the guard
    records it; a read-only step's stray edit attempt doesn't count), or the
    answer quotes such a "Blocked: …" note; or
  - Tests (except in a clean-up) or Build left `git status` and `git diff
    HEAD` exactly as they were.

## Limits of this build

- "Fixer" is the deck's `fixer` if there is one, else the built-in
  `bug-fixer` (there is no built-in called `fixer`).
- Commit isn't checked for "changed nothing": a commit empties the diff, so
  git can't tell.
- A step that only touches gitignored files counts as changing nothing.
- If git can't be read, the "changed nothing" check is skipped.
