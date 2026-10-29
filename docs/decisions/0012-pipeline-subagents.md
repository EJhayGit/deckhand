# Pipeline steps run as subagents Deckhand spawns

Date: 2026-10-29. Replaces 0007's "every step runs in the main chat with its
agent active" and the parts of 0011 that swap the agent in use.

## What was asked

The owner tried 0.3.1 live. Each step was typed into the chat as their own
prompt, and the agent in use was meant to change, but it didn't. No subagent
ever started, so the same Claude did every step. Each step should be done by
its own agent, without typing into the chat.

## What was built

- **Deckhand spawns each step itself:** `$.agent.spawn({ subagentType,
  prompt, description })` with the step's agent type (`deckhand:test-writer`,
  a project agent's file name, or `general-purpose` for plain Claude Code).
  The prompt is the same step text as before.
- **Its answer is its own `turn.complete`** (matched by `agentId`). That
  answer becomes the step's result file, then the next step is spawned or
  the run stops at a gate. 0007 assumed the mod couldn't read a subagent's
  answer; it can.
- **Review:** each reviewer is spawned with its own prompt
  (`reviewerPrompt`), side by side. When all have ended, their lines are
  joined (`joinReviews`) and merged as before. The skeptic is spawned the
  same way.
- **The agent in use is never touched.** The chat stays as you left it.
- **Limits:** the `tool.call` guard used the agent in use's limits for every
  loop, so a test-writer subagent was blocked whenever researcher was in use.
  Now a loop keeps its own limits (`loopAgent` in `src/session.ts`,
  `limitsFor` in `src/limits.ts`):
  - a Pipeline step's subagent uses its step agent's limits, and plain
    Claude Code (`general-purpose`) has all of them;
  - a deck agent the model spawned is found by its Runs row;
  - any other loop (the chat, `general-purpose` the model spawned, an unknown
    id) still gets the agent in use's limits, so nothing that was blocked
    before is let through.
- **A refused spawn:** auto mode can refuse a start nothing in the chat asked
  for (seen live in 0.2). The step is then blocked with the reason, plus a
  **Send through chat** button that sends one visible prompt asking the chat
  to start that agent (`chatPrompt`; Review uses `reviewPrompt` as before).
  That turn's answer counts as the step's.
- **Preflight** also refuses an agent on a Local or Codex model for a step,
  because those only answer the main chat and can't be subagents.
- **Runs:** each step's subagent gets a row titled like `Pipeline 2/4 ·
  Tests`, recorded by `onSpawned`. A plugin's own spawn doesn't run its own
  `agent.spawn` hook, so the Pipeline records the row itself.

## Limits of this build

- Stop ends the run and ignores later answers. There's no API to kill a
  running subagent, so it finishes on its own.
- In the test engine, a plugin's `$.agent.spawn` reaches `agent.spawn` hooks
  shaped like the Agent tool's input (`subagent_type`) and reads the id back
  from `result.agentId`. The test world answers both shapes. The live
  engine's documented result is `{ model, agentId }`, which the code reads.
- Still to confirm live: that auto mode allows a plugin-started spawn from a
  button. If not, every step shows **Send through chat**.
