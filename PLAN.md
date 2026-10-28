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
| Chip band above prompt | `ui.render` hook on `{ component: 'AbovePrompt' }` |
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

### Band above the prompt

Shown only while an agent is active:

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
    ui/deck.tsx  ui/band.tsx  ui/form.tsx  ui/status.ts
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

Built on branch `build-v2` after 0.1.0. Details and reasons are in
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
- **Swarms (optional):** Parallel (presets or custom) and Lead (swarm-lead,
  which allows everything so its workers keep their own limits).

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
