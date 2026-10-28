# Handoff

## State

- 0.1.0 is released on `main` (tag `v0.1.0`).
- 0.2.0 is built on branch `build-v2` (PR open, not merged): 16 built-in
  agents, plugin Set up, the new deck look, the Runs tab, optional swarms and
  `/deck swarm`. See `PLAN.md` section 12 and
  `docs/decisions/0004-agent-catalog-and-plugin-setup.md`,
  `0005-swarms-and-runs-view.md`.
- Checks pass: `claude plugin validate .`, `tsc` (with the bundled types),
  `claude plugin test .` (83 tests).
- The repo ships project Claude Code setup: `.claude/settings.json` turns on
  plugins from the official and `anthropics/skills` marketplaces, and
  `.claude/agents/` has reviewer, test-writer, debugger and docs-writer (these
  Deckhand-dev helpers were left as they are; the project reviewer replaces
  the built-in one in this repo's deck).

## Next step

- Owner: install `build-v2` (`claude --plugin-dir .` from this folder), open
  the Swarm tab, run Launch kit on a small task, and watch the Runs tab.
  Then try Set up on frontend-designer and restart.

## Open items

- First live swarm (Launch kit, 2026-10-28): the four agents started from the
  chat prompt and their rows showed in the Runs tab, with tokens, cost and
  the timer moving. Fixed after it: Parallel
  now goes through the chat (auto mode refused direct spawns), and progress
  calls match their run by part (they arrived without an agent id).
- Still to confirm live: steps like `2/4` show, now that progress calls match
  by part.
  - The `skills` names `<plugin>:<skill>` resolve once the plugins install.
  - The progress bar Box (`width="NN%"`, `height={1}`) draws on desktop.
- Model prices in `src/models.ts` (`PRICES`) are list prices from 2026-10;
  update them with `CLAUDE_IDS` when models change.
- README has no screenshots: they need a live session.
- PNG/JPG icons are wrapped in an SVG `<image>`; unverified on desktop.
- `claude plugin validate .` flags a missing LICENSE and icon. That only
  matters for the official plugin directory.
