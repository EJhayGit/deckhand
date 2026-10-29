# Auto for the Pipeline's Kind and Size

Date: 2026-10-29.

## What was asked

An **Auto** chip first in the Pipeline's Kind and Size rows, on by default:
guess both from the task's words, with no model call, and show why.

## What was built

- Auto is the draft's `kind` / `size` being `null`. Clicking another chip
  picks that row; clicking Auto goes back to guessing.
- `guessKind` and `guessSize` in `src/pipeline.ts` (pure). Rules are checked
  in order and the first match wins:
  - Kind: fix, bug, broken, error, crash → Fix; add, new, support → Feature;
    change, "make it", instead → Change; clean, refactor, tidy, rename →
    Clean up; else Feature.
  - Size: redesign, rewrite, "new system" or 6+ files → Big; auth, login,
    security, secrets, API, migration, database, payments or 2+ files →
    Normal; typo, rename, copy, "one line" → Tiny; under 12 words with no
    files → Small; else Small. Security words are checked before Tiny, so
    security work is never Tiny.
- Under the chips: `Auto: Fix · Normal (says "fix", mentions login)`, for the
  rows on Auto only. It updates as the task is typed.
- **After Plan**, a Normal run whose plan names 6+ files becomes Big, and the
  first stop says `Size bumped to Big: the plan names N files.`

## Limit

The steps are fixed when the run starts. A bump after Plan changes the label
and tells the owner, but adds no Research step and doesn't swap planner for
architect, since that step has already run. To get the full Big steps, Stop
and start again with Big picked.
