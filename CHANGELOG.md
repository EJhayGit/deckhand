# Changelog

## 0.5.0 (unreleased)

- **The Deck looks like a deck.** Each agent is a card in a grid with its
  icon, name, status (`● in use`, `▶ running 1`, `○ ready`), model and what
  it may do. **⋯** opens the card's details under the grid.
- **Put on step:** put an agent card on a Pipeline step from its details;
  the Swarm tab opens with it there. It's a click, not drag (decision 0014).
- **Skill cards:** pinned skills and the agent in use's skills show as a row
  of small cards on the Deck tab. The Skills tab uses small cards too.
- **Pipeline steps are cards:** the Swarm tab shows the steps as a row of
  cards with each one's agent and status, and every finished step's result
  file. Blocked steps show `■ blocked`.
- Shorter limit badges: `read only`, or `edit`, `run`, `web`.
- A pending Delete stays on screen until you answer it, even with the card's
  menu closed. The step agent picker closes once its step starts.

## 0.4.0 (unreleased)

- **The Pipeline waits for each step's agent.** Before, a step sent through
  the chat finished as soon as the chat's own turn ended, even when the agent
  it started was still running in the background, so the next step began
  early with no real result. Now the step finishes only when the agent the
  chat started gives its own final answer, and that answer is the result.
- **Start goes through the chat.** Claude Code refuses agents started from
  the panel, so every step (Review's reviewers and the skeptic too) is typed
  into the chat as one prompt. Its agents run in the foreground, so the chat
  turn waits for them. **Send through chat** is gone: it's how every step runs.
  A chat turn that starts no agent blocks the step with **Retry**.
- **New built-in agents:** committer (writes Conventional Commits messages
  that match your git log and commits, never pushes; the Commit step uses it),
  code-explorer, silent-failure-hunter and code-simplifier, all adapted from
  ECC.
- **Researcher is web only:** its only tools are web search and web fetch, so
  it researches online instead of reading the repo. The Research step says so.
- docs-writer can now run commands (ECC's doc-updater can), and builder no
  longer commits after each slice: the committer does that after Review.
- The agent in use is told which tools are off for it, so it stops trying them.
- The panel's title shows the version, like `Deck v0.4.0`.

## 0.3.3 (unreleased)

- **New built-in agent: builder.** It builds a feature from a plan, slice by
  slice, keeping the checks green (adapted from ECC, credited in
  `THIRD_PARTY_NOTICES.md`).
- The Pipeline's Build step falls back to the builder when the agent in use
  can't edit and run. Before, it fell back to bug-fixer, whose instructions
  forbid adding features.
- The Build step now says not to commit. Commit is its own step after Review
  and your OK, and an early commit would leave Review an empty diff.

## 0.3.2 (unreleased)

- **Pipeline steps are real subagents:** Deckhand starts each step's agent
  itself and saves its answer as the step's result. Nothing is typed into
  your chat, and the agent in use is never changed. Review's reviewers and
  the skeptic are started the same way.
- **Subagents keep their own limits:** a test-writer can edit even while a
  read-only agent is in use in your chat. The chat and other subagents still
  get the agent in use's limits.
- If Claude Code refuses to start a step's subagent, the step says why and
  offers **Send through chat**.
- Start refuses a step whose agent runs on a Local or Codex model, because
  those can't be subagents.

## 0.3.1 (unreleased)

- **Pipeline step agents:** each step runs with an agent suited to it
  (researcher, planner, test-writer, a fixer for Build, reviewer, plain
  Claude Code for Commit), not the agent in use at Start. A missing one falls
  back to plain Claude Code and the step says so. The agent in use comes back
  when the run ends.
- Each step lists its agent; its **agent** chip picks another for this run.
- **Preflight:** Start refuses a step whose agent lacks a permission it needs,
  with **Use plain Claude Code for this step**.
- **Blocked steps:** a step blocked by the limits, or Tests/Build changing
  nothing, stops the run there with **Retry** and **Change agent**, instead
  of moving on.

## 0.3.0 (unreleased)

- **Skills tab:** every installed skill, grouped and searchable. Run one with
  a note, pin favorites per project, or add one to the agent in use.
- **Built-in agents adapted from ECC** (MIT, Affaan Mustafa): reviewer,
  planner, test-writer, security-auditor, refactorer, docs-writer and
  bug-fixer get ECC's fuller checklists; architect and typescript-reviewer are
  new. Ids are unchanged. Credits in `THIRD_PARTY_NOTICES.md`.
- **Pipeline** is the Swarm tab's main mode: kind and size chips, ordered
  steps that build on each other, result files in `.deckhand/pipeline/`, and
  stops for your OK after Plan and before Commit. Parallel stays.
- **Auto Kind and Size:** both start on Auto, guessed from the task's words
  with the reason shown under the chips. A plan naming 6+ files bumps Normal
  to Big.
- **Lead mode and the swarm-lead agent are removed:** Pipeline does the same
  job with your OK at each stop, and swarm-lead needed every limit on.
  `/deck swarm lead` is gone too.
- **Review with a skeptic:** reviewers run side by side, duplicate findings
  merge, and the new skeptic agent must prove each serious one or it is
  dropped. **Fix these first** sends Build back.

## 0.2.1 (2026-10-28)

- swarm-lead now calls deck agents by their full type (`deckhand:reviewer`,
  ...). Before, it used bare names, and the calls failed with "Agent type not
  found".
- Model chips show the version: Haiku 5.5, Sonnet 5.5, Opus 5.5, and the new
  Fable 5.1. Agent files keep using the aliases.
- The status line is gone. The chip band already shows the active agent.

## 0.2.0 (2026-10-28)

- 16 built-in agents in every deck, in foldable groups: Core, Design,
  Security, Web and Lead. The old starters have new, fuller instructions.
- Agents can name plugins and preload skills. **Set up** adds a missing plugin
  to the project's `.claude/settings.json` after you confirm.
- New card look: pixel mascots, a colored weight word, model and effort.
- Runs tab: every agent the session started, with steps, context, tokens,
  estimated cost, time, a progress bar and totals.
- Optional swarms: Parallel (presets or a custom pick; Deckhand sends the
  request to the chat and Claude starts the agents) and Lead (swarm-lead
  delegates). `/deck swarm`.
- Agents report steps to the Runs tab with the `deck_progress` tool.
- XHigh effort chip.
- MIT license.

## 0.1.0 (2026-10-28)

First release.

- Deck panel beside the chat: agent cards with Use, Edit, Duplicate, Save to
  my library, Add to this project and Delete; a None choice.
- Agent files in `.claude/agents/`, readable by plain Claude Code. Saving keeps
  unknown keys, comments, line endings and the body.
- A library across projects, with library-only agents registered for Claude.
- Chip band above the prompt: model, effort, Edit files / Run commands /
  Internet, Repeat, Stop, and Save to agent.
- Limits enforced on every tool call (subagents included) by a guard that
  fails closed, with a toast and a transcript note when a call is blocked.
- Status line: agent, model, effort, limits and loop progress.
- New and Edit form: starters, 16 emoji, any emoji, icon upload, colors, model
  (plus a custom id), effort, allowed-to toggles, and instructions imported
  from AGENTS.md, CLAUDE.md or an agent file.
- Repeat: 3× after each turn, or every 10, 30 or 60 minutes; never two at once.
- `/deck` slash commands.
- Local (Ollama) and Codex agents, answered by Deckhand inside the session.
