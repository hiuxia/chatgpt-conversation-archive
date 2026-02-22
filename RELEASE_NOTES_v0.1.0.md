# v0.1.0

Initial release of `ChatGPT Conversation Archive`.

## Highlights

1. Export current conversation to Markdown.
2. Select conversations from history and export ZIP.
3. Preserve Markdown structure for rich assistant content.
4. Better resilience with reconnect/reinject and retry/backoff.
5. Pagination and selection persistence in side panel.

## Safety and Privacy

1. Processing is local in browser extension context.
2. No remote upload or telemetry is implemented in this release.
3. Permission usage documented in `PRIVACY.md`.

## Validation

1. `npm run test:cdp` -> PASS
2. `npm run test:zip` -> PASS

