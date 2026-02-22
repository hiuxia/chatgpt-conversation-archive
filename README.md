# ChatGPT Conversation Archive

Chrome extension project for exporting ChatGPT conversations to Markdown, including single-conversation export and batch export from history.

## Release

Current target release: `v0.1.0`

Key docs:

1. `PRIVACY.md`
2. `SECURITY.md`
3. `CHANGELOG.md`
4. `RELEASE_NOTES_v0.1.0.md`

## Build Release Artifact

```bash
cd chatgpt-conversation-archive
mkdir -p release
cd extension
zip -r ../release/chatgpt-conversation-archive-v0.1.0-extension.zip . -x "*.DS_Store"
```

## Agent Guide

- `AGENTS.md`

## Docs

- `doc/00-onboarding.md`
- `doc/01-development-setup.md`
- `doc/02-developer-instructions.md`
- `doc/03-chatgpt-page-analysis.md`
- `doc/04-implementation-plan.md`
- `doc/05-architecture.md`
- `doc/06-debug-runbook.md`
- `doc/07-test-plan.md`
- `doc/08-decision-log.md`
- `doc/09-progress-status.md`
