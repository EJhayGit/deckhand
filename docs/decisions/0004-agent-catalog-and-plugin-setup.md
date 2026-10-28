# Built-in agents and plugin setup

Date: 2026-10-28.

## What was asked

Ship many agents with fixed, well-written instructions; give some of them
outside plugins (taste-skill for design, Trail of Bits for security); add a
website reviewer; update the default agents.

## What was built

- `src/agents/starters.ts` holds 16 built-in agents in five groups: Core
  (reviewer, bug-fixer, test-runner, test-writer, docs-writer, planner,
  researcher, refactorer), Design (frontend-designer, ui-critic,
  graphics-designer), Security (security-auditor, dependency-auditor,
  change-security-review), Web (website-reviewer) and Lead (swarm-lead). They
  are also the form's "Starts from" choices, with Blank.
- Every deck shows them. A project file or library agent with the same name
  replaces the built-in card.
- Built-ins are registered with `$.agent.register` so swarms can start them,
  but an `agent.offer` hook hides them from the model unless swarm-lead is in
  use. Sixteen extra agent descriptions in every prompt would cost tokens for
  nothing.
- Agent files gain two keys: Claude Code's own `skills` (preloaded into the
  agent) and `deckhand.plugins` (`<plugin>@<marketplace>`).
- A card whose plugins aren't on shows "needs <plugin>" and **Set up**. After
  the owner presses **Add**, Deckhand merges the plugin into this project's
  `.claude/settings.json` (`enabledPlugins`, plus `extraKnownMarketplaces` for
  a marketplace it knows). Claude Code offers the install on restart.

## Why this way

- A mod can read settings (`$.settings.read`) but cannot install plugins.
  Project settings are the closest working option, the same route
  `0003-preinstalled-plugins-and-agents.md` uses, and they never touch
  `~/.claude`.
- A settings file that isn't a JSON object is left alone, never rewritten.
- Skills are named `<plugin>:<skill>` as Claude Code lists plugin skills. Trail
  of Bits skill names weren't confirmed, so those agents name the skills in
  their instructions instead of preloading them.

## Sources checked (2026-10-28)

- Leonxlnx/taste-skill: marketplace `taste-skill`, plugin `taste-skill`,
  skill `design-taste-frontend`; MIT.
- trailofbits/skills: marketplace `trailofbits`; plugins
  `audit-context-building`, `insecure-defaults`, `sharp-edges`,
  `static-analysis`, `fp-check`, `differential-review`,
  `supply-chain-risk-auditor`.
- anthropics/claude-plugins-official: `frontend-design`, `playwright`,
  `chrome-devtools-mcp`, `security-guidance`.
- anthropics/skills: marketplace `anthropic-agent-skills`, plugin
  `example-skills` (canvas-design, theme-factory, brand-guidelines,
  webapp-testing, ...).
- Community picks came from GitHub collections (wshobson/agents,
  VoltAgent/awesome-claude-code-subagents) and blog round-ups. Reddit refused
  automated reads, so no Reddit thread was read directly.

## Not done

- `security-guidance` is not attached to any agent: it adds hooks to the whole
  session, not to one agent.
- Skill names inside plugins can change; a missing skill is skipped by Claude
  Code, and the agent's instructions still say what to do.
