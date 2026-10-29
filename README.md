# Deckhand

A Claude Code mod: a deck of reusable agents beside the chat, with clickable
chips for model, effort, limits and repeat. Make an agent once, use it in any
project, and keep it inside the limits you set.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install deckhand --marketplace EJhayGit/deckhand
```

Answer `y` to add the marketplace, then pick a scope (user scope is first).

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt
box, then **Plugins**, **Add marketplace** with `EJhayGit/deckhand`, then
**Add plugin**.

A **Deck** panel opens beside the chat.

## Use it

1. The Deck already holds 18 ready agents (see below). To make your own, click
   **+ New**, type a name, pick what it starts from, and click **Save**. The
   agent is saved to `.claude/agents/<name>.md`, so plain Claude Code can use
   it too.
2. Click **Use** on a card. Its chips appear at the top of the Deck tab,
   showing the agent, model, effort and what it may do.
3. Type your task as usual. The agent's instructions, model and effort apply
   to the chat, and its limits apply to every tool call.
4. Click **None** (or `/deck none`) to go back to plain Claude Code.

### Built-in agents

| Group | Agents |
| --- | --- |
| Core | reviewer, bug-fixer, builder, test-runner, test-writer, docs-writer, planner, researcher, refactorer, architect, typescript-reviewer, skeptic |
| Design | frontend-designer, ui-critic, graphics-designer |
| Security | security-auditor, dependency-auditor, change-security-review |
| Web | website-reviewer (give it a URL) |

Built-in agents adapted from ECC by Affaan Mustafa: reviewer, planner,
test-writer, security-auditor, refactorer, docs-writer, bug-fixer, architect
and typescript-reviewer (MIT, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

Click a group's name to fold it. A file in `.claude/agents/` with the same
name replaces the built-in card.

Some agents work best with a plugin: frontend-designer and ui-critic use
[taste-skill](https://github.com/Leonxlnx/taste-skill), the security agents use
[Trail of Bits skills](https://github.com/trailofbits/skills), website-reviewer
uses Playwright or Chrome DevTools. Their cards say **needs …**. Click
**Set up**, then **Add**: Deckhand adds the plugins to this project's
`.claude/settings.json`, and Claude Code offers to install them when you
restart it. Nothing global is changed.

### Skills

The **Skills** tab lists every installed skill: Pinned first, then Yours,
then one group per plugin. Type in **Search** to filter by name or
description. Click a skill, add an optional note, and click **Run**: it runs
as if you typed `/<skill> <note>`. Click ☆ to pin a skill in this project
(saved in `.claude/deckhand/skills.json`). **Add to agent** adds the skill to
the agent in use.

### Pipeline

The **Swarm** tab opens on **Pipeline**: a task runs through steps, each
building on the last one's result, and it stops for your OK.

1. Type the task. **Kind** (Feature, Fix, Change, Clean up) and **Size**
   start on **Auto**: Deckhand guesses them from your words and says why, for
   example `Auto: Fix · Normal (mentions login)`. Click another chip to pick
   one yourself, or **Auto** to go back. If the plan names more files than a
   Normal run should, the first stop says the size was bumped to Big.
2. Click **Start**.

| Size | Steps | Stops for your OK |
| --- | --- | --- |
| Tiny | Build → Review → Commit | before Commit |
| Small | Tests → Build → Review → Commit | before Commit |
| Normal | Plan → Tests → Build → Review → Commit | after Plan, before Commit |
| Big | Research → Plan → Tests → Build → Review → Commit | after Plan, before Commit |

Deckhand starts each step as its own subagent (researcher, planner or
architect, test-writer, reviewer). Nothing is typed into your chat, and the
agent you have in use stays as it is. Each subagent keeps its own limits, and
the Runs tab shows it working. Build uses the agent you had in use if it can edit and run, otherwise the
builder; Commit runs as plain Claude Code. Click a step's **agent** chip to pick
another for this run. Start refuses a step whose agent lacks what it needs
(with **Use plain Claude Code for this step**), and a step blocked by the
limits, or that changed nothing when it should, stops with **Retry** and
**Change agent**. If Claude Code refuses to start a step's subagent, the step
says why and offers **Send through chat**. Each answer is saved to
`.deckhand/pipeline/<run>/` and the next step reads it. At a stop, click
**Approve**, **Change** (type a note; the step runs again with it) or
**Stop**.

**Review** starts reviewer, plus typescript-reviewer for TypeScript and
security-auditor for security-sensitive changes, merges their duplicate
findings, and has the skeptic agent re-check every serious one. Only findings
it proves stay; medium and low ones show as advice. If any are confirmed,
**Fix these first** sends Build back with them, then Review again.

### Parallel

The Swarm tab's other mode runs several agents at once on separate jobs: pick
a preset (Launch kit, Security sweep, Ship check) or tick agents, type the
task, click **Start**. Deckhand sends a prompt to the chat naming each agent
and its part, and Claude starts them in the background. Or type
`/deck swarm launch-kit <task>`.

Each agent in a swarm keeps its own limits: Claude Code holds it to the tools
its file allows.

### Runs

The **Runs** tab shows every agent this session started, from a swarm, a
pipeline step (tagged like `Pipeline 3/5 · Tests`) or Claude: its model and effort, steps, context use, tokens, estimated cost, time
and a progress bar, with totals on top. Cost is an estimate from list prices.

### The chips

- **Model:** Default, Haiku 5.5, Sonnet 5.5, Opus 5.5, Fable 5.1, Codex, Local.
  An agent file can name any of them by alias (`haiku`, `sonnet`, `opus`,
  `fable`), which always means the latest version.
- **Effort:** Low, Medium, High, XHigh, Max.
- **Can:** Edit files, Run commands, Internet. A new agent starts with all
  three off (read only). A blocked call shows a toast and a note in the chat,
  for example: "Blocked: reviewer tried to run `npm install`, but Run commands
  is off for this agent."
- **Repeat:** Once, 3×, 10 min, 30 min, 60 min. Pick one, then send a prompt.
  **Stop** shows while a loop runs.
- **Save to agent** appears when the chips differ from the agent's file.

Chip changes apply to this session at once.

### Cards

Each card has **Use**, **Edit** and a **…** menu with Duplicate, Save to my
library, and Delete (asks first). Library agents show in every project; use
**Add to this project** to write one out as a file.

### Slash commands

| Command | Does |
| --- | --- |
| `/deck` | Opens the Deck panel |
| `/deck use <name>` | Uses an agent |
| `/deck none` | Turns the agent off |
| `/deck repeat 3` / `10m` / `30m` / `60m` | Repeats your next prompt |
| `/deck repeat stop` | Stops a loop |
| `/deck limits` | Shows what the active agent may do |
| `/deck swarm <launch-kit\|security-sweep\|ship-check> <task>` | Starts a Parallel swarm |

### Local models and Codex

- **Local** sends the chat to [Ollama](https://ollama.com) on this machine
  (`http://localhost:11434`, model `llama3.2`). Run `ollama pull llama3.2`
  first. In an agent file, `model: local:<name>` picks another model. Local
  models answer in text only here: they don't read files or run commands.
- **Codex** runs `codex exec` in the project folder. Install the
  [Codex CLI](https://github.com/openai/codex) and sign in first. Codex is read
  only unless the agent's Edit files is on.

Change the server, default model or Codex command in the mod's settings
(`/config`, under deckhand).

### Icons

Pick one of 16 emoji, type any emoji, or upload your own: give the path to an
`.svg`, `.png` or `.jpg` file. Uploads are copied to
`.claude/deckhand/icons/`. PNG and JPG files are wrapped in an SVG, and need to
be under about 90 KB. The terminal shows the emoji or first letter instead.

## Agent file format

```markdown
---
name: fixer
description: Fixes the bug you describe with the smallest change.
model: sonnet
effort: medium
disallowedTools: [WebFetch, WebSearch]
color: orange
deckhand:
  icon: "🛠️"
  limits: { edit: true, run: true, internet: false }
  gateway: null
---
Fix the bug I describe with the smallest change.
```

Two optional keys: `skills: [<plugin>:<skill>, ...]` preloads skills into the
agent, and `plugins: [<plugin>@<marketplace>, ...]` under `deckhand:` lists the
plugins its Set up button adds.

Keys Deckhand doesn't know, comments, and the body are kept as written when it
saves.

## Develop

Run it from this folder for one session:

```
claude --plugin-dir .
```

Checks:

```
claude plugin validate .
tsc -p .
claude plugin test .
```

`tsc -p .` needs the API types Claude Code writes into `.claude-plugin/types/`
the first time it loads the mod (see `docs/decisions/0001-hooks-import-and-turn-cancel.md`).

## License

MIT. See [LICENSE](LICENSE). Third-party credits are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
