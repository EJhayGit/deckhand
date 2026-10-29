# Review step with a skeptic check

Date: 2026-10-29.

## What was asked

The Pipeline's Review step runs several reviewers side by side, merges their
duplicate findings, and has a skeptic re-check every serious one, after ECC's
`orch-review` (`PLAN.md` 14, Milestone 4).

## What was built

- **Diff first.** Deckhand reads `git status --porcelain` and `git diff HEAD`
  itself and writes the diff to `<nn>-review.diff` in the run's folder. No
  diff, or git failing, fails the step.
- **Fan out.** One turn, with reviewer in use, asks the main chat to start
  `reviewer`, plus `typescript-reviewer` when a `.ts`/`.tsx` file changed and
  `security-auditor` on a security trigger (auth, secrets, shell commands,
  network, file paths, permissions), and to answer with only their finding
  lines. Built-ins are offered to the model for that turn, as in Parallel.
- **Same format.** One JSON line per finding: severity, file, line, title,
  evidence, reviewer.
- **The reviewers' lines come back in the main chat's answer**, not appended
  to a file: the reviewers are read-only and the mod reads the main answer
  directly (see 0007). Deckhand writes the merged report to `<nn>-review.md`.
- **Merge** (`src/findings.ts`, pure): grouped by whitespace-normalized
  evidence; strictest severity; every reviewer listed.
- **Skeptic**, a new read-only built-in. A second turn with skeptic in use
  checks each critical or high finding and answers one verdict line each.
  Only "confirmed" with quoted proof stands; anything else, missing or
  garbled is refuted. Medium and low pass through as advice.
- **Show.** The Commit gate lists Confirmed, then Advice, then Refuted, with
  who found each. With anything confirmed it offers **Fix these first**:
  Build runs again with the findings, then Review again.

## Fails closed

Empty diff, an empty answer, or a finding line that won't parse fails the
step with the reason. A review that didn't happen never passes.
