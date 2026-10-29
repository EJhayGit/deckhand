# Skills tab

Date: 2026-10-29.

## What was asked

A Skills tab that lists every installed skill, runs one with a press, pins
favorites per project, and adds a skill to the active agent (`PLAN.md` 14).

## What was built

- **Listing:** the mod API has `$.command.list()`, so Deckhand uses it
  instead of reading skill folders. No plugin install paths to guess.
- **Groups:** Pinned, Yours, then one per plugin. The API says only `user` or
  `plugin` for a command's source, so project and personal skills share one
  group, Yours. A plugin's markdown commands look the same as its skills and
  show too. Built-in and MCP commands and Deckhand's own `/deck` are left out.
- **Run:** the host refuses a plugin prompt that starts with `/`, so Run uses
  `$.command.run({ command, args })`. It runs as if the owner typed
  `/<skill> <note>`, with its lines in the transcript.
- **Pins:** `.claude/deckhand/skills.json` in the project, so each project
  keeps its own and they survive a restart.
- **Add to agent:** appends the skill to the active agent's `skills` list
  through the same save path as Save to agent.

Pure logic is in `src/skills.ts`, the tab in `src/ui/skills.tsx`.
