# ECC agents as the built-in defaults

Date: 2026-10-29.

## What was asked

Where ECC (Everything Claude Code, MIT) has a stronger version of a Deckhand
built-in, use it; add two ECC agents the Pipeline needs (`PLAN.md` 14).

## What was taken

From `affaan-m/ECC` `agents/` at commit `25278e7`, copyright 2026 Affaan
Mustafa:

| Deckhand id | ECC agent | Limits |
| --- | --- | --- |
| reviewer | code-reviewer | read + run (read-only commands) |
| planner | planner | read only |
| test-writer | tdd-guide | edit + run |
| security-auditor | security-reviewer | read + run (scans only) |
| refactorer | refactor-cleaner | edit + run |
| docs-writer | doc-updater | edit |
| bug-fixer | build-error-resolver, plus our "reproduce first" | edit + run |
| architect (new) | architect | read only |
| typescript-reviewer (new) | typescript-reviewer | read + run (checks only) |

Internet is off for all of them. Ids, groups, icons and hats stay, so saved
swarms and project overrides still match. Each entry has an
`origin: ECC <agent> @ 25278e7` comment.

## How they were adapted

- Kept ECC's steps, checklists, tables and examples.
- Cut the "Prompt Defense Baseline" block, pointers to ECC-only skills and
  commands (`tdd-workflow`, `security-review`, `/update-docs`,
  `react-reviewer`), ECC's own stack example, eval addenda, and the
  "nuclear option" cache-clearing commands.
- Trimmed each to well under 150 lines; every line costs tokens per run.
- Reviewer and typescript-reviewer may run read-only commands (git diff, tsc)
  since ECC's versions need them; the plan allows "run off or read-only".
- The license text and copyright are in `THIRD_PARTY_NOTICES.md`; the README
  credits ECC.
