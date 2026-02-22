# 00 Onboarding

This guide is for a teammate or agent with zero project context.

## What This Project Is

- Name: `ChatGPT Conversation Archive`
- Goal: Chrome extension to export ChatGPT conversations as Markdown.
- Supported flows:
  - Export current conversation
  - Select history conversations and batch export ZIP

## Current Project State

- Documentation baseline is ready.
- MV3 extension skeleton exists under `extension/`.
- Current MVP supports:
  - export current conversation to markdown
  - load visible history links from ChatGPT sidebar
  - select history items and export selected conversations to ZIP
- Current hardening level:
  - content-script ping + auto reinject recovery is implemented
  - extraction waits for async-rendered turns before failing
- Next implementation step: batch progress/cancellation and deeper diagnostics/testing hardening.

## Prerequisites

1. macOS + Google Chrome
2. Node.js 20+ and npm
3. Access to a ChatGPT account for local testing

## Folder Orientation

- `AGENTS.md`: doc maintenance rules and handoff checklist
- `README.md`: doc index
- `doc/`: all planning and execution docs

## First Commands

Run from project root:

```bash
pwd
ls -la
find . -maxdepth 3 -type f | sort
```

## Validate Current Extraction Quickly

```bash
cd chatgpt-conversation-archive
npm install
npm run test:cdp
npm run test:zip
```

This runs an automated smoke test against the live ChatGPT page through Chrome remote debugging (`9222`).

## Recommended Reading Order

1. `doc/09-progress-status.md`
2. `doc/04-implementation-plan.md`
3. `doc/05-architecture.md`
4. `doc/03-chatgpt-page-analysis.md`
5. `doc/07-test-plan.md`

## Immediate Next Step (Execution)

1. Add batch progress reporting in side panel (per-item status).
2. Add user cancellation support for running batch jobs.
3. Add structured runtime diagnostics for retries/failures in side panel.
4. Add unit tests for markdown serializer and batch E2E automation.
5. Run manual test cases from `doc/07-test-plan.md` and update `doc/09-progress-status.md`.
