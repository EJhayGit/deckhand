# Changelog

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
