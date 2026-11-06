# Limits hold through subagents

Date: 2026-11-06. Adds to `0011-pipeline-step-agents.md` and
`0015-review-fix-loop.md`.

## What was wrong

An audit found three ways round a limit:

- A read-only agent in use could start a deck agent with Edit on (say the
  fixer) through the Agent tool, and that subagent kept its own looser limits.
- A Review agent that the chat started as another type (say
  `general-purpose`) matched no card, so it got the agent in use's limits, or
  none at all.
- Codex with Edit on and Run off ran in `workspace-write`, so it could run
  any command.

## What we do

- `limitsFor` (`src/limits.ts`): an owner-picked loop (`isOwners`: a Pipeline
  step's agent, or a swarm agent started during the owner's own swarm prompt,
  marked `byOwner` on its Runs row) keeps its own limits. Any other deck
  subagent gets each limit only if both it and the agent in use have it on.
  The blocked note names both: `fixer (started by reviewer)`.
- `loopAgent` (`src/session.ts`): any agent in the Review step, reviewers
  and the skeptic, gets its card's limits with Edit off, or read-only when no
  card matches.
- `codexArgv`: `workspace-write` only with both Edit and Run on.

## Limits

Codex reads files through its own shell, so with Run off it can still run
read-only commands. The read-only sandbox stops writes, and the prompt asks
it to run commands only to read.
