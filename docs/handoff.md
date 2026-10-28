# Handoff

## State

- Deckhand 0.1.0 is released: PR #2 merged into `main` and tagged `v0.1.0`.
  Install with `/plugin install deckhand --marketplace EJhayGit/deckhand`.
- Decisions: `docs/decisions/0001-hooks-import-and-turn-cancel.md` and
  `0002-codex-and-local-models.md`.

## Next step

- Owner: install it and try it in a live session, then report what breaks.

## Open items

- Not tried in a live session yet. Everything is covered by
  `claude plugin test .`, which mocks the engine, files, Ollama and Codex.
- README has no screenshots: they need a live session.
- PNG/JPG icons are wrapped in an SVG `<image>`. Whether the desktop draws an
  embedded raster that way is unverified.
- Model chips send full ids (`claude-haiku-5-5`, `claude-sonnet-5-5`,
  `claude-opus-5-5`) in `turn.step`. Update `src/models.ts` when models change.
- The xhigh effort ("More" chip) was skipped.
- `claude plugin validate .` flags a missing LICENSE. That only matters for the
  official plugin directory.
