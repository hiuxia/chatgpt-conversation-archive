# 05 Architecture

Last updated: `2026-02-22`

## High-Level Components (Current)

1. `extension/content.js`
   - Runs on `https://chatgpt.com/*`
   - Extracts conversation turns and history links from DOM
   - Converts assistant rich DOM blocks into markdown text

2. `extension/background.js`
   - Receives commands from side panel
   - Handles messaging with content script (ping/reinject recovery)
   - Orchestrates single export and batch export
   - Builds markdown text and ZIP bytes
   - Triggers downloads

3. `extension/sidepanel.js`
   - Renders action buttons and history list
   - Provides pagination controls for history browsing
   - Maintains selected IDs with `chrome.storage.session` persistence
   - Calls background actions and displays status/failure details

4. `tests/`
   - CDP smoke test for live extraction and markdown fidelity
   - ZIP self-test for archive integrity

## Data Flow

1. User clicks an action in side panel.
2. Side panel sends runtime message to background worker.
3. Background finds active tab or opens background tab(s) for selected conversations.
4. Background checks tab readiness and content script availability.
5. Content script returns extracted conversation payload.
6. Background serializes markdown and downloads:
   - single `.md` file, or
   - batch `.zip` file
7. Side panel displays final success/failure status.

## Runtime Resilience

1. Connection health check via `PING`.
2. Auto reinject of `content.js` on messaging connection loss.
3. Wait-until-ready for newly opened background tabs.
4. Wait-for-turns render loop before extraction failure.

## Core Payload Shape

```ts
interface ConversationPayload {
  id: string;
  title: string;
  sourceUrl: string;
  exportedAt: string;
  turns: Array<{
    role: string;
    text: string;
    markdown: string;
    attachments: Array<{ src: string; alt: string }>;
  }>;
}
```

## Known Gaps

1. No live batch progress stream and no cancel action yet.
2. Selector fallback map is still limited and needs broader runtime diagnostics.
3. Markdown serializer is embedded in `content.js`/`background.js` rather than a shared module.

## Planned Refactor Direction

1. Move shared serialization/util logic into `extension/shared/`.
2. Add explicit job-state model for batch progress/cancel.
3. Add unit tests around serializer and naming helpers.
