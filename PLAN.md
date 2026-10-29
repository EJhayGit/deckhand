# Deckhand build plan

Deckhand is a Claude Code mod: a deck of reusable agents beside the chat, with
clickable chips for model, effort, limits and repeat. It replaces the Agent
Workflow Lab (AWL) Studio app. It has no server, no run records and no required
tests.

Visual reference: the "Deckhand mod sketch" page (mockups and feature table).
This file is the source of truth when the two differ.

---

## 1. Goals

1. **Light layer over Claude Code.** It runs inside Claude Code (desktop app,
   terminal, VS Code) and changes nothing about how Claude Code already works
   when no agent is active.
2. **Click, not type.** Every choice is a button or chip. Typing is only for the
   task itself, an agent's name, and optional instructions.
3. **Reusable agents.** Make an agent once and use it in any project.
4. **Restrictions that hold.** Limits are enforced on every tool call, not
   only at start.
5. **Loops.** Repeat a task a few times, or on a timer while the window is open.
6. **Any model.** Claude models by chip, plus Codex and local models through a
   gateway (see milestone M7).

## 2. Non-goals

- No budget or cost caps. The owner decided against them.
- No required tests or verification gates. "Run tests after" is optional,
  off by default and comes later.
- No separate app, local server, run records, worktrees or crash recovery.
- No drag and drop in v1 (mod panels have buttons). A desktop-only drag
  experiment is listed under Later.
- No writes to `~/.claude/settings.json` or other global Claude Code settings.

## 3. Setting up the repo (owner does this once)

1. On GitHub, create an empty repo `EJhayGit/deckhand` with no README, license
   or .gitignore. Public lets anyone install it; private installs only for
   people with access.
2. Clone it locally and put this `PLAN.md` and the provided `CLAUDE.md` in its
   root.
3. Make sure Claude Code is up to date, and that the `plugin-authoring` skill
   ("Make a mod") is listed in a session. If it isn't, update Claude Code
   before starting.
4. Open Claude Code in the repo folder and paste the kickoff prompt.

## 4. How it uses the mod API

| Need | Mod API used |
| --- | --- |
| Deck panel beside chat | `$.ui.open({ id: 'deck', title: 'Deck' })` and a `ui.render` hook on `{ component: 'Pane', requestId: 'deck' }` |
| Chips for the active agent | top of the Deck tab in the Pane (moved off the chat 2026-10-29; the chat stays clean) |
| Status line | `$.ui.status(text)` after each turn and on every change |
| Blocked notes, loop done | `$.ui.toast(text)` |
| Agent instructions apply to chat | `prompt.compose` hook adds one section (`scope: 'session'`) with the active agent's instructions |
| Model and effort per agent | `turn.step` hook: `next({ ...e, model, effort })` for main-loop requests (`e.agentId === undefined`) |
| Limits | `tool.call` hook returns `{ deny }` for blocked tools, wrapped in `.catch(($, e, next) => next.called ? next(e) : { deny: '...' })` so it fails closed |
| Agents Claude can delegate to | `$.agent.register({ name, description, prompt, tools, disallowedTools, model, effort, permissionMode })` |
| Repeat | `turn.complete` hook plus `$.prompt.submit`; timers through `$.clock` |
| Stop | cancel the running turn (see the turn noun's cancel in the types) and clear timers |
| Slash commands | `$.command.register` in `session.start`, answered by `command.run` |
| Session state (active agent, chips, loop) | `$.state` atoms declared in `types/index.d.ts` |
| Library across projects | `$.store` |
| Agent files, icons | `$.fs` |

Check each call against the types in `.claude-plugin/types/claude-code/index.d.ts`
once the mod has loaded. Grep for the name rather than reading the whole file.

Effort levels are `low`, `medium`, `high`, `xhigh` and `max`. Chips show Low,
Medium, High and Max, with xhigh behind a "More" chip only if it's cheap to add.

## 5. Agent file format

Each agent is a Claude Code agent Markdown file, so plain Claude Code can use it too.

```markdown
---
name: fixer
description: Fixes the bug you describe with the smallest change.
model: sonnet            # alias, full id, or a gateway model name (M7)
effort: medium
tools: [Read, Grep, Glob, Edit, Write, Bash]
disallowedTools: [WebFetch, WebSearch]
color: orange
deckhand:
  icon: "🛠️"             # emoji, or a file under .claude/deckhand/icons/
  limits: { edit: true, run: true, internet: false }
  gateway: null          # M7: name of a configured gateway, or null
---
Fix the bug I describe with the smallest change. Explain what you changed in
two sentences.
```

- **Where they live:** the project's `.claude/agents/<name>.md`. "Save to my
  library" also keeps a copy in `$.store` so it shows in every project, and
  "Add to this project" writes it back out as a file.
- **Limits map to tools:**
  - Edit files off removes `Edit`, `Write`, `MultiEdit` and `NotebookEdit`.
  - Run commands off removes `Bash`.
  - Internet off removes `WebFetch` and `WebSearch`.
- **Read only by default.** A new agent starts with all three limits off.
- **Round trip:** the parser keeps unknown frontmatter keys and the body
  unchanged, so files edited by hand survive a save.

**Starter agents**, offered in "Starts from":

| Starter | Model | Effort | Edit | Run | Internet |
| --- | --- | --- | --- | --- | --- |
| Reviewer | haiku | medium | off | off | off |
| Bug fixer | sonnet | medium | on | on | off |
| Docs writer | haiku | low | on | off | off |
| Test runner | haiku | low | off | on | off |
| Blank | default | default | off | off | off |

## 6. Screens

The sketch page has the mockups. In words:

### Deck panel

- A header with "Deck" and a "+ New" button.
- One card per agent:
  - icon tile in the agent's color
  - name
  - a one-line summary (model and description)
  - badges ("read only", "edits files", "runs commands", "internet")
  - buttons: Use (shows "In use" when active), Edit, and a "…" menu with
    Duplicate, Save to my library, Delete (with a confirm button)
- A dashed "+ New agent" card at the end.
- A "None" choice to turn the active agent off, so Claude Code goes back to normal.

### Chips in the Deck

At the top of the Deck tab, shown only while an agent is active (not above
the prompt: the owner wants the chat left alone):

- the active agent
- Model chips: Default, Haiku, Sonnet, Opus, Codex, Local
- Effort chips: Low, Medium, High, Max
- Can toggles: Edit files, Run commands, Internet
- Repeat chips: Once, 3×, 10 min, 30 min, 60 min
- Stop (only while a loop runs)

A chip change applies to this session at once. A "Save to agent" chip appears
when the chips differ from the agent's file.

### Status line

`🔍 Reviewer · Haiku · high effort · read only · loop 2 of 3`. Cleared when no
agent is active.

### New and Edit agent form

Opens in the panel. Fields:

- Name
- Starts from (starter chips)
- Icon: 16 built-in emoji, "Any emoji…" and "Upload my own icon"
- Color: 8 swatches
- Model chips, plus "Custom…" to pick a gateway model
- Effort chips
- Allowed-to toggles
- Instructions, with buttons "Import an AGENTS.md", "Import a CLAUDE.md or
  agent file" and "Write my own", and a text box

Buttons are Save and Cancel.

### Blocked note

A toast and a short notice in the transcript: "Blocked: Reviewer tried to run
`npm install`, but Run commands is off for this agent."

### Terminal

The same parts drawn as text boxes. Uploaded icons fall back to the agent's
emoji or first letter.

## 7. Milestones

All milestones are built in order on one branch (`build-v1`) with one PR; the
milestones are the build order only. Each ends with a commit, its tests
passing, plus `claude plugin validate .` and `tsc -p .`. The builder doesn't
stop to ask between milestones.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | **Skeleton and install.** Files from section 8, a panel that says "Deck is empty", the README install section, and marketplace.json. | The owner can install it with `/plugin install deckhand --marketplace EJhayGit/deckhand` and see the panel. |
| M1 | **Agent files.** Parse and serialize the agent format, starters, load from `.claude/agents/` and `$.store`, register each with `$.agent.register`. | Round-trip tests pass, including unknown keys and hand edits, and agents appear in Claude Code's agent list. |
| M2 | **Deck panel.** Cards, Use, None, Edit (opens the form stub), Duplicate, Delete. Active-agent state in `$.state`. | A test mounts the panel on terminal and desktop, presses Use, and sees the active card. |
| M3 | **Apply the agent.** `prompt.compose` instructions, `turn.step` model and effort, `tool.call` limits, blocked toast and note, status line, chip band. | Tests show a blocked Bash, Edit and WebFetch call for each toggle, and allowed calls passing. Model and effort get rewritten only for the main loop. The guard fails closed. |
| M4 | **New agent form.** All fields from section 6, icon upload to `.claude/deckhand/icons/`, and instruction import from AGENTS.md, CLAUDE.md or an agent file. | Tests cover save, edit, import and a read-only default. The desktop shows the uploaded icon (see the note below). |
| M5 | **Repeat.** 3× resends after each `turn.complete`. Timers every 10, 30 or 60 minutes. Stop. Never two at once. Stops on Stop, an error, or the chosen count. | Mocked-clock tests cover each stop rule and "never two at once". |
| M6 | **Slash commands.** `/deck` (open panel), `/deck use <name>`, `/deck none`, `/deck repeat <3\|10m\|30m\|60m\|stop>`, `/deck limits`. | Tests for each command. |
| M7 | **Codex and local models.** Research spike first (section 9), then build the option that works. | The owner can pick Local (Ollama) on an agent and chat with it, or the plan records why not and what was built instead. |
| M8 | **Polish and release 0.1.0.** Terminal pass, README with screenshots, CHANGELOG, tag `v0.1.0`. | The owner installs from GitHub on a clean machine and follows the README. |

**Icon note (M4):** the desktop surface draws `Svg` but not `Image`, and the
terminal draws `Image`. Accept SVG uploads everywhere. For PNG and JPG, try
embedding them in an `Svg` image element on desktop. If that's refused, accept
SVG only and say so in the form.

## 8. Repo layout

The repo root is both the plugin and its marketplace, so the install line is short.

```
deckhand/
  .claude-plugin/
    plugin.json          { "name": "deckhand", "version": "0.1.0", "description": "...", "types": "./types/index.d.ts" }
    marketplace.json     { "name": "deckhand", "owner": { "name": "EJhayGit" }, "plugins": [{ "name": "deckhand", "source": "./" }] }
  hooks/
    hooks.json           { "modules": ["./register.tsx"] }
    register.tsx         wires events to the modules below; stays short
  src/
    agents/format.ts     parse/serialize agent Markdown (pure)
    agents/starters.ts
    agents/library.ts    load/save via $.fs and $.store
    limits.ts            limits -> tools/disallowedTools, and the tool.call decision (pure)
    risk.ts              (Later) warn-only rules ported from AWL
    repeat.ts            loop state machine (pure; the clock is injected)
    ui/deck.tsx  ui/chips.tsx  ui/form.tsx  ui/status.ts
    commands.ts
  types/index.d.ts       PluginState contract for $.state
  tests/*.test.ts(x)
  docs/handoff.md        current state, next step, open items
  docs/decisions/        one short file per real design choice
  README.md  CHANGELOG.md  CLAUDE.md  PLAN.md  tsconfig.json  .gitignore
```

Whether the hooks module can import from `src/` should be confirmed in M0. If
it can't, keep the pure logic in `hooks/` next to `register.tsx`. Keep pure
logic (format, limits, repeat) free of `$` so it tests without the engine.

## 9. Codex and local models (M7 spike)

Claude Code talks to Claude-style (Anthropic Messages) APIs. Options to check,
in order:

1. **Gateway per agent.** Find out whether a `turn.step` model rewrite can
   reach a gateway model, and whether `$.env.set('ANTHROPIC_BASE_URL', ...)`
   affects the running session's API client or only child processes.
   - Ollama and LM Studio both expose Anthropic-compatible endpoints for local
     models.
   - LiteLLM can put OpenAI or Codex models behind one.
   - If a per-agent switch works, the agent's `deckhand.gateway` names one of
     the gateways set in the mod's `userConfig`.
2. **Whole-session gateway.** If option 1 can't work, a gateway choice applies
   to the next session. The panel says "Restart to switch to Local", and
   Deckhand writes nothing global without a confirm button.
3. **Hand-off to Codex.** A "Codex" agent sends the task to the Codex CLI
   (`codex exec`) via `$.process.spawn` in the project folder, streams its
   output into the panel, and appends a summary to the chat.

Record the result in `docs/decisions/`, build the option that works, and explain
it in the PR.
Local models vary a lot in tool use, so show a one-line hint on Local agents.

## 10. Testing rules

- Use `claude plugin test .` for hook and UI tests (`claude-code/testing`:
  `test`, `expect`, `mock`). Mount every panel on both `terminal` and
  `desktop`.
- Run plain unit tests on the pure modules.
- Use the mocked clock for anything with timers. Never really wait.
- **No paid model calls in automated tests.** Manual tries in the owner's own
  session are fine. Say what was tried and with which model.
- Before each PR, run `claude plugin validate .`, `tsc -p .` and all tests,
  then read the diff.
- Mark the limit guard tests as must-pass. A limit that leaks is the worst bug
  this mod can have.

## 11. Later (not in v1)

- **Run tests after:** a per-agent toggle, off by default. It runs the
  project's own test command once after a turn and shows pass or fail.
- **Risk warnings:** warn-only toasts ported from AWL's rules:
  - an edit to test or CI config (package.json, tsconfig*, vitest, vite, jest
    or playwright config, pyproject.toml, pytest.ini, tox.ini, .mocharc*,
    `.github/workflows/`)
  - `git push`
  - a recursive delete (`rm -r`, `rmdir /s`, `Remove-Item -Recurse`,
    `git clean -d/-x`)
  - a read or write outside the project folder
- **Share an agent:** copy its file, or export a small bundle with its icon.
- **Drag and drop on desktop:** the desktop surface supports a `Client`
  region drawn by the mod's own surface module. Test whether it can do drag
  between cards and a drop zone.
- **More repeat modes:** "until tests pass", up to 3 tries.

## 12. v0.2: built-in agents, Runs and swarms

Built on branch `build-v2` after 0.1.0 and merged as PR #6. Details and reasons are in
`docs/decisions/0004-agent-catalog-and-plugin-setup.md` and
`0005-swarms-and-runs-view.md`.

- **Built-in agents:** 16 in five groups (Core, Design, Security, Web, Lead),
  shown in every deck; a project or library agent of the same name wins.
  Hidden from the model unless swarm-lead is in use.
- **Plugins and skills:** `skills` and `deckhand.plugins` in the agent file.
  Set up writes project `.claude/settings.json` only, after a confirm.
- **Look:** tabs Deck, Runs, Swarm; pixel mascots; a weight word from effort
  (light, medium, careful, heavy); XHigh effort chip.
- **Runs:** a row per started agent with steps, ctx, tokens, estimated cost,
  time and a bar; Cost, Tokens and Time totals. No cost cap.
- **Swarms (optional):** Parallel (presets or custom; a prompt in the chat
  asks Claude to start the agents, since auto mode refuses spawns nothing
  asked for) and Lead (swarm-lead, which allows everything so its workers
  keep their own limits).

v0.3 (section 14) adds the Skills tab, ECC-adapted built-ins (plus architect,
typescript-reviewer and skeptic), and the Pipeline as the Swarm tab's main
mode; Parallel stays. Lead and swarm-lead are removed.

## 13. Working rules for the building agent

- Read `CLAUDE.md`, this plan and `docs/handoff.md` at the start of every
  session. Update `docs/handoff.md` before ending one.
- Load the `plugin-authoring` skill before writing mod code, and follow it for
  layout, types, testing and sharing.
- Work inline in the session. Don't use subagents or per-task reviewer agents.
- Build every milestone on one branch and one PR, committing after each. Write
  commit messages and PR text in plain words.
- Keep it small. Add no runtime dependencies without a clear need and a note in
  `docs/decisions/`.
- When the API can't do something this plan assumes, build the closest option
  and say so in plain words in the PR. Don't change a feature silently.

## 14. Skills, ECC agents and Pipeline (master plan, 2026-10-29)

Copied from the owner's master plan. Build notes and API gaps are in
`docs/decisions/0006`-`0009` and the PR.

### Goal

Deckhand becomes one menu for agents, skills and multi-agent work. This plan adds a Skills tab, a credited pack of agents adapted from ECC (Everything Claude Code, MIT), and reworks the Swarm tab into a Pipeline modeled on ECC's `orch-*` engine and its review workflow. Nothing here depends on ECC being installed. We borrow ideas and a few adapted files.

**For the build agent:** read `CLAUDE.md`, `PLAN.md` and `docs/handoff.md` first, as always. One prompt is enough: build all four milestones in order, on one branch with one PR, committing after each one, without stopping to ask in between. Work inline with no subagents. Copy this plan into `PLAN.md` as section 14 before starting.

**Model:** run it on Opus. To save tokens, Milestone 2 alone can run on Sonnet as a separate prompt.

Rules from `CLAUDE.md` that matter most here:

- Load the `plugin-authoring` skill before touching mod code.
- Work inline. Don't spawn subagents to build this. The Pipeline *feature* starts agents for the user, which is fine.
- Keep pure logic (pipeline sizing, step planning, finding merge) free of `$`, so it tests without the engine.
- Limits stay in the `tool.call` guard and fail closed. Never weaken a limit test.
- Automated tests make no paid model calls. Use the mocked clock.
- Never write `~/.claude/...` without a confirm button the owner presses.
- Each design choice gets a short note in `docs/decisions/`.
- Run `claude plugin validate .`, `tsc -p .` and `claude plugin test .` before each commit.

### Where Deckhand is today

As of 0.2.1 plus the unmerged `band-layout` branch, the deck panel has three tabs (`DeckTab = 'deck' | 'runs' | 'swarm'` in `types/index.d.ts`).

| Part | What it does now | Main files |
| --- | --- | --- |
| Deck | 16 built-in agents in five groups, plus project and library agents from `.claude/agents/`. Chips for model, effort, limits, repeat. | `src/agents/starters.ts`, `src/agents/library.ts`, `src/agents/format.ts`, `src/ui/deck.tsx`, `src/ui/chips.tsx` |
| Runs | One row per started agent with steps, context, tokens, estimated cost and time. | `src/runs.ts`, `src/tracker.ts`, `src/ui/runs.tsx` |
| Swarm | Parallel (preset or custom agents, each gets the same task) or Lead (swarm-lead splits the task). Both start by submitting a prompt with `$.prompt.submit({ text, asUser: true })`. | `src/swarm.ts`, `src/ui/swarm.tsx` |
| Skills | Only as a `skills` list inside an agent file, added to that agent's instructions. No menu. | `hooks/register.tsx` |

The Swarm tab's weak spot is that Parallel agents never see each other's work, and Lead's choices are hidden. There is no plan, no hand-off and no point where the owner approves.

### Milestone 1: Skills tab

A fourth tab, Skills, lists every installed skill. One click runs it, so nobody has to remember or type `/skill-name`.

**What the owner sees**

- A Pinned row at the top, then one group per source: Project, Personal, and one per plugin (for example `document-skills`).
- Each skill shows its name and the first line of its description. A search box filters by name or description.
- Pressing a skill opens a small form with an optional note and a Run button. Run submits `/<skill> <note>` as the owner's own prompt, the same way swarms start.
- A pin button on each skill. Pins persist per project.
- Below the list: "Add to agent", which appends the skill to the active agent's `skills` list using the existing Save to agent path.

**How to build it**

1. Add `'skills'` to `DeckTab` in `types/index.d.ts`, and a `skillsPinned: string[]` key to the state contract.
2. First grep `.claude-plugin/types/claude-code/index.d.ts` for a call that lists skills or commands. If one exists, use it.
3. If not, read skill folders directly with `$.fs`: project `.claude/skills/*/SKILL.md`, personal `~/.claude/skills/*/SKILL.md` (read only), and each enabled plugin's `skills/*/SKILL.md` under the plugin install folder. Find the plugin folder the same way `src/plugins.ts` resolves plugins today. Write a decision note on which road you took.
4. Put the parsing in a pure module, `src/skills.ts`: frontmatter to `{ id, name, description, source }`, grouping, search, and the `/plugin:skill` name form.
5. Draw it in `src/ui/skills.tsx`. Wire the tab in `hooks/register.tsx` only.

**Tests**

- `tests/skills.test.ts`: frontmatter parsing (missing or long description, odd quoting), grouping, search and the name form.
- `tests/skills.test.tsx`: the tab lists skills from the memory world, Run submits the right prompt, pins survive a reload.

**Done when** the tab lists real skills in a live session, Run starts one, and the checks pass.

### Milestone 2: ECC agents become the defaults

Where ECC has a stronger version of a Deckhand built-in, its version replaces ours. Ours run about 30 lines each. ECC's carry real checklists and examples (its code-reviewer is 323 lines, its planner 221). Two ECC agents with no match are added because the Pipeline uses them. Source: [affaan-m/ECC](https://github.com/affaan-m/ECC) `agents/` at commit `25278e7`, MIT, copyright 2026 Affaan Mustafa.

| Deckhand built-in | Becomes (ECC agent) | Notes |
| --- | --- | --- |
| reviewer | `code-reviewer` | Keep the id `reviewer` so saved swarms and project overrides still match. |
| planner | `planner` | Pipeline's Plan step. |
| test-writer | `tdd-guide` | Pipeline's Tests step. Keep the id `test-writer`. |
| security-auditor | `security-reviewer` | Pipeline's Review step uses it on security triggers. |
| refactorer | `refactor-cleaner` |  |
| docs-writer | `doc-updater` |  |
| bug-fixer | `build-error-resolver` | Merge in our "reproduce first" steps, which ECC's lacks. |
| (new) architect | `architect` | Plan step for Big tasks. Read only. |
| (new) typescript-reviewer | `typescript-reviewer` | Review step when the diff has TypeScript. |

Keep ours as they are where ECC has no match: test-runner, researcher, frontend-designer, ui-critic, graphics-designer, website-reviewer, dependency-auditor, change-security-review, swarm-lead.

**How to adapt each one**

1. Replace the body in `src/agents/starters.ts`. Keep each existing id, group and icon so nothing that refers to it breaks.
2. Keep ECC's content: its steps, checklists and examples. Cut anything that points at ECC-only commands, skills or rules, and anything for languages Deckhand users won't need in a general agent.
3. Trim to about 150 lines at most. Every line costs tokens each time the agent runs.
4. Set Deckhand limits, since the guard enforces those rather than a `tools` list. Reviewers, planner and architect: edit off, run off or read-only. Fixers and test writers: edit on, run on. Internet off for all of them.
5. Add an `origin: ECC <agent> @ 25278e7` comment above each one.

**Credit:** add `THIRD_PARTY_NOTICES.md` with ECC's full MIT license text and copyright line, and a "Built-in agents adapted from ECC by Affaan Mustafa" line in the README. Write `docs/decisions/0006-ecc-default-agents.md` listing what was taken and why.

**Tests:** update `tests/catalog.test.ts` so every built-in still loads and parses, ids are unchanged, the two new ones appear, each limit matches the rules above, and a project agent with the same name still wins.

**Done when** the deck shows the new defaults with their old names, and a live run of reviewer and planner uses the new instructions.

### Milestone 3: Pipeline (rework the Swarm tab)

Pipeline becomes the Swarm tab's main mode. It runs a task through ordered steps, and each step builds on the last one's result. The owner approves twice: after the plan and before the commit. This is ECC's `orch-pipeline` recipe, rebuilt in Deckhand's own UI.

*(Diagram in the original: Normal pipeline · 5 steps, 2 stops for your OK.)*

Change sends the plan back with your note. Fix these first sends confirmed review findings back to Build before you commit.

**Kind and size.** The owner types the task, then picks a kind and a size. Deckhand suggests both and the owner can change them.

- Kinds (from ECC's `orch-*` family): Feature, Fix, Change, Clean up. The kind sets the first move. Fix starts with a failing test. Clean up must keep the tests green.
- Sizes set which steps run. The suggestion comes from a pure heuristic in `src/pipeline.ts` (task length, number of files named, words like "API", "auth" or "migrate"). Anything touching security or a public API is at least Normal.

| Size | Steps that run | Stops for OK |
| --- | --- | --- |
| Tiny | Build → Review → Commit | before Commit |
| Small | Tests → Build → Review → Commit | before Commit |
| Normal | Plan → Tests → Build → Review → Commit | after Plan, before Commit |
| Big | Research → Plan → Tests → Build → Review → Commit | after Plan, before Commit |

**Who does each step**

- Research: `researcher` (read only, internet on).
- Plan: `planner`, or `architect` for Big. Output is a numbered task list of thin slices.
- Tests: `test-writer` (now ECC's tdd-guide).
- Build: the main chat with the agent in use if it can edit and run, else `fixer` (or the built-in `bug-fixer`), else plain Claude Code.
- Review: `reviewer`, plus `security-auditor` on security triggers (Milestone 4).
- Commit: the main chat as plain Claude Code, one commit per logical chunk.
- A missing default agent falls back to plain Claude Code. Each step's agent can be picked for one run, Start refuses a step whose agent lacks a permission it needs, and a step blocked by the limits (or that changed nothing when it should edit) stops the run with Retry and Change agent (`docs/decisions/0011-pipeline-step-agents.md`).

**Hand-offs.** Each step writes its result to `.deckhand/pipeline/<run-id>/<nn>-<step>.md`, and the next step's prompt names that file. Files are the hand-off because the mod can't read a subagent's final answer directly. They also leave a record the owner can open.

**Running a step.** Deckhand submits each step as the owner's own prompt with `$.prompt.submit`, like swarms do now. When that turn ends (the hook `closeSwarm` already uses), it marks the step done and either submits the next one or stops at a gate. One step per turn, so a gate can never fall in the middle of a step.

**Gates.** At a gate the Swarm tab shows the step's result file in short form and three buttons: Approve (go on), Change (type a note, then the step runs again with it) and Stop.

**The tab**

- Top: task box, kind chips, size chips, Start.
- Middle: one card per step showing icon, agent, status (waiting, running, done, needs OK, failed) and a link to its result file.
- Mode chips: Pipeline (default), Parallel (kept for quick fan-out) and Lead under "More".
- Runs: every step's agent shows as a row tagged with the step, for example `Pipeline 3/5 · Tests`.

**Code**

- `src/pipeline.ts` (pure): size heuristic, steps for a kind and size, next step after an event, prompt text per step.
- `src/pipelineRun.ts`: the `$` side (submit, turn-end, result files). Wire it in `hooks/register.tsx`.
- `src/ui/swarm.tsx`: the new layout. Add a `pipeline` key to `types/index.d.ts`.
- `docs/decisions/0007-pipeline.md`.

**Tests**

- Pure: every kind and size gives the table's steps, security words bump the size, Fix starts with a failing test, and Change re-runs the same step with the note.
- Engine: a Normal run stops after Plan, Approve submits Tests, Stop ends it, and a failed step stops the run and shows the error. Use the mocked clock and fake turn ends, with no model calls.
- Limits: each step's agent keeps its own limits in `tool.call`. A read-only Plan agent can't edit.

**Done when** a Normal Fix runs end to end in a live session with both stops, and the checks pass.

### Milestone 4: Review step with a skeptic check

The Review step runs several reviewers side by side, merges their duplicate findings, then has a skeptic agent re-check every serious one. This copies ECC's `orch-review` workflow, where 11 raw findings shrank to 4 real ones and the checking cost roughly halved.

1. **Fan out.** One turn asks the main chat to start these deck agents at once, the way Parallel does today: `reviewer` always, `typescript-reviewer` when the diff has `.ts` or `.tsx` files, and `security-auditor` (now ECC's security-reviewer) when the diff touches a security trigger (auth, secrets, shell commands, network, file paths, permissions).
2. **Same format.** Each reviewer appends findings to the step's result file as one JSON line each: `severity` (critical, high, medium, low), `file`, `line`, `title`, `evidence` (the exact code snippet) and `reviewer`.
3. **Merge (pure, `src/findings.ts`).** Group findings by their whitespace-normalized `evidence` snippet, because line numbers and titles drift between reviewers but the code doesn't. Keep the strictest severity and list every reviewer that found it.
4. **Skeptic.** A new read-only built-in agent, `skeptic`, checks each unique critical or high finding. It must quote the code that proves the bug, or mark the finding refuted. When unsure, it refutes. Medium and low findings pass through as advice.
5. **Show.** The step card lists confirmed findings first, then advice, with who found each one. If anything is confirmed, the Commit gate offers "Fix these first", which runs Build again with the findings, then Review again.

**Fail closed.** If the diff is empty, a result file is missing or a line won't parse, the step fails and shows why. It never passes a review that didn't happen.

**Tests:** merge cases (same snippet with a different line or title, different severities), the security trigger, the skeptic refuting by default, and malformed lines failing the step.

**Done when** a live Review on a real diff shows merged findings with reviewer names, and a planted bug survives the skeptic.

### Out of scope, risks and open questions

**Not in this plan:** installing ECC itself, ECC's hooks, rules or memory and learning system, its MVP-from-spec mode, its agents beyond the nine in Milestone 2, and running steps in the background without the owner.

**Risks**

- No mod call may list skills. The fallback is reading skill folders, and plugin install paths could change between Claude Code versions.
- Auto mode can refuse agent starts that nobody asked for. Every step must go out as the owner's own prompt, like swarms do now.
- More steps means more tokens. The size check keeps small tasks short, and Runs already shows the cost.
- `.deckhand/pipeline/` files pile up. Add it to `.gitignore` and keep only the last 20 runs.

**Open questions for the owner**

- [x] Keep Lead under "More", or remove it? Removed, with swarm-lead (2026-10-29).
- [x] Should Pipeline's Build step use the active agent or always a fixed one? The active agent if it can edit and run, else a fixer (2026-10-29).
- [ ] Any agent to add to or drop from the swap list in Milestone 2?
