# Pipeline steps go through the chat and wait for their agent

Date: 2026-10-29. Replaces 0012's "Deckhand spawns each step itself" and its
Send through chat fallback. 0012's limits (`loopAgent`) still hold.

## What was seen

The owner ran a Big pipeline live. Auto mode refused Deckhand's own
`$.agent.spawn` from the Start button, so each step needed **Send through
chat**. The chat started the step's agent **in the background** and its turn
ended at once with "I'll pass on its answer when it finishes". Deckhand took
that main-turn reply as the step's result, so Plan stopped for OK while the
architect was still working. The pipeline didn't wait.

## What was built

- **Every step goes through the chat.** Start (and Approve, Change, Retry,
  Fix these first) types the step into the chat as one prompt naming the
  agent to start (`chatPrompt`; `reviewPrompt` for the reviewers; the skeptic
  through `chatPrompt`). The built-ins are offered to the model for that turn.
  The prompt goes out once the clock moves, since it can be sent from inside
  the last turn's `turn.complete`.
- **The step's agent is captured at spawn.** In `agent.spawn`, a spawn in the
  main loop during the step's chat turn (`pipelineSpawnTitle`) is the step's:
  Deckhand rewrites it to `background: false`, so the chat turn waits, and
  names it `Pipeline 2/5 · Plan` for Runs. Its id joins `run.agentIds`.
- **Only the agent's own answer counts.** The step finishes when every
  captured agent's `turn.complete` is in and the chat turn has ended, in
  either order. The chat's reply is ignored (the prompt asks it to say only
  "Done."). A chat turn that started no agent blocks the step with Retry.
- **Send through chat and the fake "main chat" Runs rows are gone.** The real
  agents get their rows from the `agent.spawn` hook.
- A denial in the main chat no longer blocks a step; only the step agent's
  own loop counts.

## Agent audit against ECC

ECC's `agents/` is still at `25278e7`, the commit 0006 copied from, so the
nine adapted agents are current. Tools compared with ECC's frontmatter:

| Deckhand | ECC | ECC tools | Ours (limits) | Change |
| --- | --- | --- | --- | --- |
| reviewer | code-reviewer | Read, Grep, Glob, Bash | read + run | none |
| planner | planner | Read, Grep, Glob | read | none |
| architect | architect | Read, Grep, Glob | read | none |
| test-writer | tdd-guide | Read, Write, Edit, Bash, Grep | edit + run | none |
| security-auditor | security-reviewer | Read, Grep, Glob, Bash | read + run | none |
| typescript-reviewer | typescript-reviewer | Read, Grep, Glob, Bash | read + run | none |
| refactorer | refactor-cleaner | Read, Write, Edit, Bash, Grep, Glob | edit + run | none |
| bug-fixer | build-error-resolver | Read, Write, Edit, Bash, Grep, Glob | edit + run | none |
| docs-writer | doc-updater | Read, Write, Edit, Bash, Grep, Glob | edit only | **now edit + run** |
| builder | gan-generator | Read, Write, Edit, Bash, Grep, Glob | edit + run | no longer commits per slice |

Added from ECC at `25278e7`, with 0006's trims:

- **committer** (commit-reviewer): run on, edit off. Unlike ECC's, it commits:
  Conventional Commits matching `git log`, one per logical chunk, never push,
  amend or `--no-verify`. The Commit step uses it (`NEEDS.commit` is now just
  Run commands).
- **code-explorer**: read only.
- **silent-failure-hunter**: read + run. Not added to Review's reviewer list.
- **code-simplifier**: edit + run.

The rest (test-runner, skeptic, designers, dependency-auditor,
change-security-review, website-reviewer) have no closer ECC match and their
limits cover their jobs.

## Researcher is web only

The owner keeps researcher for the internet, but it kept reading the repo.
It now has an explicit `tools` list (WebSearch, WebFetch, deck_progress), so
Claude Code never offers it file or shell tools. Its body and the Research
step's prompt say to search the web; the Plan step reads the code.

The agent in use in the main chat is also told which tools are off for it
(`offText`), so it stops trying calls the guard denies.

## Limits of this build

- Still to confirm live: that auto mode allows the model's Agent call from
  this prompt (Parallel's prompt passes), that the `background: false`
  rewrite holds, and that `turn.start` text equals the submitted prompt.
- If the rewrite is ignored and the agent runs in the background, the step
  still waits for it. The chat's later "task finished" turn is ignored.
