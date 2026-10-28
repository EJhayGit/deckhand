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

1. In the Deck panel, click **+ New**. Type a name, pick a starter (Reviewer,
   Bug fixer, Docs writer, Test runner or Blank), and click **Save**. The agent
   is saved to `.claude/agents/<name>.md`, so plain Claude Code can use it too.
2. Click **Use** on a card. A chip band appears above the prompt, and the
   status line shows the agent, model, effort and what it may do.
3. Type your task as usual. The agent's instructions, model and effort apply
   to the chat, and its limits apply to every tool call.
4. Click **None** (or `/deck none`) to go back to plain Claude Code.

### The chip band

- **Model:** Default, Haiku, Sonnet, Opus, Codex, Local.
- **Effort:** Low, Medium, High, Max.
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
