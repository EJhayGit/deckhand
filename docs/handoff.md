# Handoff

## State

- 0.2.0 is on `main`: PR #6 merged 2026-10-28, not tagged yet (only
  `v0.1.0` exists). The marketplace install reads `main`, so it gives 0.2.0
  after `/plugin update`. It has 16 built-in agents,
  plugin Set up, the new deck look, the Runs tab, optional swarms (Parallel
  goes through the chat) and `/deck swarm`. See `PLAN.md` section 12 and
  `docs/decisions/0004-agent-catalog-and-plugin-setup.md`,
  `0005-swarms-and-runs-view.md`.
- `launch/` holds a landing page with a one-page launch plan and three SVG
  graphics, made by the first live Launch kit swarm.
- Checks pass: `claude plugin validate .`, `tsc` (with the bundled types),
  `claude plugin test .` (85 tests).
- Live testing of unmerged changes runs from the session's dev-mod copy in
  `~/.claude/dev-mods/<session>/deckhand/` (hooks, src, types and
  plugin.json copied from this repo), with the marketplace deckhand turned
  off. Copy again after each change. With 0.2 merged, the marketplace
  install can be turned back on and updated instead.
- The repo ships project Claude Code setup: `.claude/settings.json` turns on
  plugins from the official and `anthropics/skills` marketplaces, and
  `.claude/agents/` has reviewer, test-writer, debugger and docs-writer (these
  Deckhand-dev helpers were left as they are; the project reviewer replaces
  the built-in one in this repo's deck).

## Next step

- Owner: run one more swarm and check that steps like `2/4` show in Runs.
  Then try Set up on frontend-designer and restart.
- Before launch (from the swarm's review): add a LICENSE, tag v0.2.0, take
  real screenshots, and export the OG card as a PNG.

## Open items

- Confirmed live (2026-10-28): a Parallel swarm starts from the chat prompt,
  and Runs rows show with tokens, cost and the timer moving.
- Still to confirm live:
  - Steps like `2/4` show, now that progress calls match by part.
  - The `skills` names `<plugin>:<skill>` resolve once the plugins install.
  - Set up's install prompt after a restart.
- Model prices in `src/models.ts` (`PRICES`) are list prices from 2026-10;
  update them with `CLAUDE_IDS` when models change.
- `launch/` ships inside the plugin (the repo root is the plugin), about
  90 KB. Move it out if that matters.
- README has no screenshots: they need a live session.
- PNG/JPG icons are wrapped in an SVG `<image>`; unverified on desktop.
- `claude plugin validate .` flags a missing LICENSE and icon.
