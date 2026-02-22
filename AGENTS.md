# AGENTS Guide

This file defines how any agent (or new teammate) should use and update project docs.

## First Read Order

1. `doc/00-onboarding.md`
2. `doc/09-progress-status.md`
3. `doc/04-implementation-plan.md`
4. `doc/05-architecture.md`
5. `doc/03-chatgpt-page-analysis.md`

## Documentation Rules

1. Update docs in the same change whenever behavior, selectors, or flow changes.
2. Keep decisions in `doc/08-decision-log.md` with date, context, and impact.
3. Update `doc/09-progress-status.md` after every meaningful implementation step.
4. If selector/API observations change, update `doc/03-chatgpt-page-analysis.md`.
5. If onboarding or setup commands change, update `doc/00-onboarding.md` and `doc/01-development-setup.md`.
6. If tests are added/changed, update `doc/07-test-plan.md` and include latest local run result.

## Progress Sync Protocol

Use this protocol whenever asked to "sync progress" or "align docs with code":

1. Read source of truth in this order:
   - `extension/manifest.json`
   - `extension/background.js`
   - `extension/content.js`
   - `extension/sidepanel.js`
   - `tests/*`
   - `package.json`
2. Compare with:
   - `doc/04-implementation-plan.md`
   - `doc/07-test-plan.md`
   - `doc/09-progress-status.md`
3. Fix contradictions immediately (never leave "already done" work in Next Actions).
4. Add exact validation commands and latest run status to docs.
5. If behavior changed, record rationale/tradeoff in `doc/08-decision-log.md`.

Completion rule for sync tasks:

- `doc/04`, `doc/07`, `doc/09`, and `AGENTS.md` are mutually consistent.
- At least one local test command is rerun and recorded.

## Required Sections for Any New Feature

1. Goal and scope
2. User flow
3. Technical flow
4. Risks and fallback
5. Test cases and acceptance criteria

Record these in:

- Plan: `doc/04-implementation-plan.md`
- Tests: `doc/07-test-plan.md`
- Progress: `doc/09-progress-status.md`

## Handoff Checklist

Before ending a task, ensure all items are true:

1. Code changes and docs are aligned.
2. `doc/09-progress-status.md` has:
   - what was done
   - what remains
   - exact next step
3. New assumptions or tradeoffs are recorded in `doc/08-decision-log.md`.
4. Any command needed for reproduction was validated and written in docs.
5. At least `npm run test:zip` was executed locally. If CDP is available, run `npm run test:cdp` too.

## Source of Truth

- Product scope: `doc/04-implementation-plan.md`
- Current state: `doc/09-progress-status.md`
- DOM/API reality checks: `doc/03-chatgpt-page-analysis.md`
