# Handoff

## State

- M0 (skeleton and install) built on branch `m0-skeleton`. The Deck panel opens
  at session start and says "Deck is empty".
- M0 unknowns answered in `docs/decisions/0001-hooks-import-and-turn-cancel.md`.

## Next step

- Owner: create the GitHub repo `EJhayGit/deckhand`, then push and open the M0 PR.
- After M0 merges: M1 (agent files) on branch `m1-agent-files`.

## Open items

- `tsc -p .` needs the types the engine lays on first load (see the decision note).
- `claude plugin validate .` reports a missing LICENSE; that only matters for the
  official plugin directory, not for installing from GitHub.
