# Preinstalled plugins and agents for this repo

Date: 2026-10-28.

## What was asked

Every session in this repo should start with useful Claude Code plugins,
skills and agents already there, taken from popular GitHub repos.

## What was built

- `.claude/settings.json` adds two marketplaces and turns plugins on. Claude
  Code offers to install them when the folder is trusted.
  - `claude-plugins-official` (anthropics/claude-plugins-official):
    `plugin-dev`, `code-review`, `pr-review-toolkit`, `commit-commands`,
    `feature-dev`, `skill-creator`, `claude-md-management`.
  - `anthropic-agent-skills` (anthropics/skills): `document-skills`.
- `.claude/agents/`: `reviewer` (read only), `test-writer`, `debugger`,
  `docs-writer`. Each file is a normal Claude Code subagent and also a Deckhand
  agent: its `deckhand:` block sets the icon and limits, so the deck shows
  them with the same limits as their `tools` list.

## Why these

- `plugin-dev` matches what this repo is: a Claude Code plugin.
- `skill-creator` comes from the official marketplace rather than
  `example-skills`, which would also bring a dozen unrelated skills.
- `typescript-lsp` was left out: it needs `typescript-language-server`
  installed on the machine, and the repo has no `node_modules`.

## Notes

- These are project settings only. Nothing writes `~/.claude/...`.
- None of this is a runtime dependency of the mod; it isn't shipped in the
  plugin.
- CLAUDE.md asks sessions to work inline without subagents. The agents here
  are for the owner to pick on purpose; that rule still applies to sessions
  building the mod. `code-review`, `pr-review-toolkit` and `feature-dev` start
  several agents each, so they cost more tokens when used.
